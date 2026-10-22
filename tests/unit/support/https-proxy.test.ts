import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { createInterface } from "node:readline";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The HTTPS front every WebKit test goes through (D-028): it passes responses through, and an
// upstream that resets in the middle of one must not take it down for the tests after it

const PROXY = "tests/support/https-proxy.ts";
const USAGE = "Usage: node tests/support/https-proxy.ts <listen port> <target port>\n";

function portOf(server: net.Server): number {
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("the server isn't listening");
  return address.port;
}

/** A port nothing listens on, for the proxy to take */
async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = portOf(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function get(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    https
      .get({ host: "127.0.0.1", port, path, rejectUnauthorized: false }, (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          body += chunk;
        });
        response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
        response.on("error", reject);
      })
      .on("error", reject);
  });
}

// An upstream that answers /ok whole and /drop not at all. After its headers and part of its body,
// it closes /close and resets /reset, which also fails the proxy's request to it.
const upstream = http.createServer((request, response) => {
  if (request.url === "/drop") {
    request.socket.destroy();
  } else if (request.url === "/close" || request.url === "/reset") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.write("partial");
    const cut = request.url === "/close" ? () => request.socket.destroy() : () => request.socket.resetAndDestroy();
    setTimeout(cut, 50);
  } else {
    response.end("fine");
  }
});

describe("tests/support/https-proxy.ts", () => {
  let proxy: ChildProcess;
  let port: number;

  beforeAll(async () => {
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    port = await freePort();
    proxy = spawn(process.execPath, [PROXY, String(port), String(portOf(upstream))], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    if (!proxy.stdout) throw new Error("the proxy has no output to read");
    for await (const line of createInterface({ input: proxy.stdout })) {
      if (line.startsWith("https://")) break;
    }
  });

  afterAll(() => {
    proxy.kill();
    upstream.close();
  });

  it("passes a response through", async () => {
    await expect(get(port, "/ok")).resolves.toStrictEqual({ status: 200, body: "fine" });
  });

  it("answers 502 when the upstream fails before its headers", async () => {
    await expect(get(port, "/drop")).resolves.toStrictEqual({ status: 502, body: "" });
  });

  it.each(["/close", "/reset"])(
    "cuts off a response the upstream ends midway (%s), and keeps serving",
    async (path) => {
      await expect(get(port, path)).rejects.toThrow();
      await expect(get(port, "/ok")).resolves.toStrictEqual({ status: 200, body: "fine" });
      expect(proxy.exitCode).toBeNull();
    },
  );

  it("refuses to start without both ports, saying how to run it", async () => {
    // The timeout ends the run if the proxy starts serving instead
    const result = spawnSync(process.execPath, [PROXY, String(await freePort())], {
      encoding: "utf8",
      timeout: 10_000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toBe(USAGE);
  });
});
