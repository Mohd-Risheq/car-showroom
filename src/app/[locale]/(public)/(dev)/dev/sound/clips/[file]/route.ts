import { readFile } from "node:fs/promises";
import path from "node:path";
import { clipOfFile, SOUND_FOLDER } from "@/app/_dev/fixtures";
import { isDeployment } from "@/lib/deployment";
import { parseRange } from "@/lib/http/range";

// The synthetic engine clips for spikes T-07 and T-08 (Q-04), made by scripts/fixtures/engine-clips.ts in
// the git-ignored .fixtures/sound/ folder. Byte ranges work, because iOS Safari plays an <audio>
// source only from a server that answers them. Not found on deployments, here and in the proxy, so
// its paths carry turbopackIgnore and the build never traces the folder.
const FOLDER = path.join(/*turbopackIgnore: true*/ process.cwd(), SOUND_FOLDER);

export async function GET(request: Request, ctx: RouteContext<"/[locale]/dev/sound/clips/[file]">): Promise<Response> {
  if (isDeployment()) return new Response(null, { status: 404 });
  const { file } = await ctx.params;
  if (!clipOfFile(file)) return new Response(null, { status: 404 });
  let body: Uint8Array<ArrayBuffer>;
  try {
    body = new Uint8Array(await readFile(/*turbopackIgnore: true*/ path.join(FOLDER, file)));
  } catch {
    return new Response(null, { status: 404 });
  }
  // A file name never changes content, so browsers may keep it. Each phone run adds a query string.
  const headers = {
    "content-type": "audio/wav",
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
  };
  const range = parseRange(request.headers.get("range"), body.byteLength);
  if (range === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { ...headers, "content-range": `bytes */${body.byteLength}` } });
  }
  if (range === null) return new Response(body, { headers: { ...headers, "content-length": String(body.byteLength) } });
  const part = body.subarray(range.start, range.end + 1);
  return new Response(part, {
    status: 206,
    headers: {
      ...headers,
      "content-range": `bytes ${range.start}-${range.end}/${body.byteLength}`,
      "content-length": String(part.byteLength),
    },
  });
}
