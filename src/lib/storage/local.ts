import "server-only";
import { createHash, randomInt } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StorageDriver } from "./driver";
import { extensionOf, MEDIA_TYPES, RANDOM_SUFFIX_LENGTH } from "./rules";
import { readCapped } from "./stream";
import { verifyLocalClientToken } from "./token";

// The local stand-in for Vercel Blob (BUILD-PLAN §6.3). Files live in the git-ignored
// .storage-local/ folder and are served from /api/storage-local/files/. /api/storage-local takes
// the SDK's upload PUT and enforces the client token the way the service does (DECISIONS.md D-022).

// Reads below carry turbopackIgnore: the store is local data, never traced into a build
const ROOT = path.join(process.cwd(), ".storage-local");
const FILES_PATH = "/api/storage-local/files/";
const LOCAL_TOKEN_PREFIX = "vercel_blob_rw_local_";
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const SUFFIX_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function siteOrigin(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!site) throw new Error("NEXT_PUBLIC_SITE_URL is not set (SRS §15.1)");
  return new URL(site).origin;
}

function localReadWriteToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token?.startsWith(LOCAL_TOKEN_PREFIX)) {
    throw new Error("The local store needs a local BLOB_READ_WRITE_TOKEN (vercel_blob_rw_local_...)");
  }
  return token;
}

// The file for a stored pathname, or undefined when a segment could leave the store folder
function fileOf(storedPathname: string): string | undefined {
  const segments = storedPathname.split("/");
  if (!segments.every((segment) => SEGMENT.test(segment))) return undefined;
  const file = path.join(ROOT, ...segments);
  return file.startsWith(ROOT + path.sep) ? file : undefined;
}

function withRandomSuffix(pathname: string): string {
  const dot = pathname.lastIndexOf(".");
  let suffix = "";
  for (let k = 0; k < RANDOM_SUFFIX_LENGTH; k++) suffix += SUFFIX_ALPHABET.charAt(randomInt(SUFFIX_ALPHABET.length));
  return `${pathname.slice(0, dot)}-${suffix}${pathname.slice(dot)}`;
}

export function createLocalStore(): StorageDriver {
  return {
    name: "local",
    readWriteToken: localReadWriteToken(),
    publicUrl: (storedPathname) => `${siteOrigin()}${FILES_PATH}${storedPathname}`,
    storedPathnameOf(url) {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return undefined;
      }
      const plain = !parsed.search && !parsed.hash && !parsed.username && !parsed.password;
      if (!plain || parsed.origin !== siteOrigin() || !parsed.pathname.startsWith(FILES_PATH)) return undefined;
      return parsed.pathname.slice(FILES_PATH.length);
    },
    async read(storedPathname, maxBytes) {
      const file = fileOf(storedPathname);
      if (!file) return "missing";
      try {
        if ((await stat(/*turbopackIgnore: true*/ file)).size > maxBytes) return "too_large";
        return new Uint8Array(await readFile(/*turbopackIgnore: true*/ file));
      } catch {
        return "missing";
      }
    },
    async remove(storedPathname) {
      const file = fileOf(storedPathname);
      if (file) await rm(file, { force: true });
    },
  };
}

// The service's error body; the SDK maps error.code to its error classes
function blobError(status: number, code: string, message?: string): Response {
  return Response.json({ error: message ? { code, message } : { code } }, { status });
}

// PUT {API URL}/?pathname=... from the SDK's upload(). The API URL ends in "?", so the SDK's
// "/?pathname=" arrives as the query key "/?pathname" and Next.js has no trailing slash to
// redirect (DECISIONS.md D-022).
export async function handleLocalPut(request: Request): Promise<Response> {
  const query = [...new URL(request.url).searchParams];
  const [first] = query;
  const pathname = query.length === 1 && first?.[0] === "/?pathname" ? first[1] : undefined;
  if (!pathname) return blobError(400, "bad_request");

  const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const check = verifyLocalClientToken(bearer, localReadWriteToken());
  if (!check.ok) return blobError(403, check.code);
  const { claims } = check;
  if (claims.pathname !== pathname) {
    return blobError(403, "client_token_pathname_mismatch", "the pathname does not match the token payload");
  }

  // Public single-request uploads only: the private demo store arrives with T-34, multipart never
  if (request.headers.get("x-vercel-blob-access") !== "public" || request.headers.has("x-mpu-action")) {
    return blobError(400, "bad_request");
  }
  const ext = extensionOf(pathname);
  if (!ext) return blobError(400, "bad_request");
  const contentType = request.headers.get("x-content-type") ?? MEDIA_TYPES[ext];
  if (!claims.allowedContentTypes.includes(contentType)) {
    return blobError(400, "content_type_not_allowed", `the content type ${contentType} is not allowed`);
  }

  const body = await readCapped(request.body, claims.maximumSizeInBytes);
  if (body === "too_large") {
    return blobError(413, "file_too_large", `the file length cannot be greater than ${claims.maximumSizeInBytes}`);
  }

  const stored = claims.addRandomSuffix ? withRandomSuffix(pathname) : pathname;
  const file = fileOf(stored);
  if (!file) return blobError(400, "bad_request");
  await mkdir(path.dirname(file), { recursive: true });
  try {
    await writeFile(file, body, { flag: claims.allowOverwrite ? "w" : "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return blobError(400, "bad_request", "the blob already exists");
    throw error;
  }

  const url = `${siteOrigin()}${FILES_PATH}${stored}`;
  return Response.json({
    url,
    downloadUrl: `${url}?download=1`,
    pathname: stored,
    contentType,
    contentDisposition: `inline; filename="${path.posix.basename(stored)}"`,
    etag: `"${createHash("sha256").update(body).digest("hex")}"`,
  });
}

// GET /api/storage-local/files/{pathname}. The real store serves media from its own origin;
// here the files share the app's origin, so they are sandboxed and never sniffed (SEC-08).
export async function serveLocalFile(segments: string[]): Promise<Response> {
  const storedPathname = segments.join("/");
  const file = fileOf(storedPathname);
  const ext = extensionOf(storedPathname);
  if (!file || !ext) return new Response(null, { status: 404 });
  let body: Uint8Array<ArrayBuffer>;
  try {
    body = new Uint8Array(await readFile(/*turbopackIgnore: true*/ file));
  } catch {
    return new Response(null, { status: 404 });
  }
  return new Response(body, {
    headers: {
      "content-type": MEDIA_TYPES[ext],
      "content-disposition": "inline",
      "cache-control": "public, max-age=2592000",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
    },
  });
}
