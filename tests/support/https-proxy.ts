// An HTTPS front for the local production server, for WebKit: it applies upgrade-insecure-requests to
// http://localhost, so over plain HTTP every subresource fails (D-028). The certificate is a
// throwaway self-signed one for localhost, made with openssl in a temporary folder that is removed
// as soon as the key is read. Playwright starts this as a webServer (playwright.config.ts).
//
// Usage: node tests/support/https-proxy.ts <listen port> <target port>
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream";

const [listen, target] = process.argv.slice(2);
if (listen === undefined || target === undefined) {
  console.error("Usage: node tests/support/https-proxy.ts <listen port> <target port>");
  process.exit(1);
}

function selfSigned(): { key: Buffer; cert: Buffer } {
  const folder = mkdtempSync(path.join(tmpdir(), "muftah-tls-"));
  try {
    const key = path.join(folder, "key.pem");
    const cert = path.join(folder, "cert.pem");
    // Piped, so openssl's progress dots stay out of the test output; a failure still reports them
    execFileSync(
      "openssl",
      [
        ...["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost"],
        ...["-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1", "-keyout", key, "-out", cert],
      ],
      { stdio: "pipe" },
    );
    return { key: readFileSync(key), cert: readFileSync(cert) };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

const server = https.createServer(selfSigned(), (request, response) => {
  const upstream = http.request(
    { host: "127.0.0.1", port: Number(target), method: request.method, path: request.url, headers: request.headers },
    (answer) => {
      response.writeHead(answer.statusCode ?? 502, answer.rawHeaders);
      // A response cut off upstream is cut off here too, rather than left open; pipeline does that
      pipeline(answer, response, () => {});
    },
  );
  // Before the headers a failure is a 502; after them the response can only be cut off
  upstream.on("error", () => {
    if (response.headersSent) response.destroy();
    else response.writeHead(502).end();
  });
  request.pipe(upstream);
});
server.listen(Number(listen), "127.0.0.1", () => {
  console.log(`https://localhost:${listen} -> http://localhost:${target}`);
});
