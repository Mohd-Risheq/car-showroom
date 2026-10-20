import { appendFile, mkdir, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEV_UPLOAD_PART_BYTES } from "@/app/_dev/upload-limits";
import { isSameOriginRequest } from "@/lib/auth/same-origin";
import { isDeployment } from "@/lib/deployment";
import { readCapped } from "@/lib/storage/stream";

// The MP4 a phone made in spike T-08, saved next to the JSON reports in the git-ignored
// .dev-reports/ folder, so ffprobe and AVFoundation can check the device's own file. Not found on
// deployments, here and in the proxy. It comes in parts, in order (DEV_UPLOAD_PART_BYTES): each
// says where it starts and how long the whole file is, a part that arrives short is refused, and
// the file gets its .mp4 name only once every byte is in.
const FOLDER = path.join(process.cwd(), ".dev-reports");
// Above the reel's 20 MB cap, so an oversized file still arrives to be measured
const MAX_BYTES = 24 * 1024 * 1024;
const MAX_FILES = 200;

export async function POST(request: Request): Promise<Response> {
  if (isDeployment()) return new Response(null, { status: 404 });
  if (!isSameOriginRequest(request)) return new Response(null, { status: 403 });
  if (request.headers.get("content-type") !== "video/mp4") return new Response(null, { status: 415 });
  const query = new URL(request.url).searchParams;
  const id = query.get("id") ?? "";
  const offset = Number(query.get("offset"));
  const total = Number(query.get("total"));
  const valid = /^[0-9a-f]{12}$/.test(id) && Number.isSafeInteger(offset) && Number.isSafeInteger(total);
  if (!valid || total < 8 || total > MAX_BYTES || offset < 0 || offset >= total || offset % DEV_UPLOAD_PART_BYTES !== 0) {
    return new Response(null, { status: 400 });
  }
  const length = Math.min(DEV_UPLOAD_PART_BYTES, total - offset);
  const body = await readCapped(request.body, length);
  if (body === "too_large" || body.byteLength !== length) return new Response(null, { status: 413 });
  // Every MP4 starts with an ftyp box: a 4-byte size, then the type
  if (offset === 0 && new TextDecoder().decode(body.subarray(4, 8)) !== "ftyp") return new Response(null, { status: 400 });

  await mkdir(/*turbopackIgnore: true*/ FOLDER, { recursive: true });
  const partial = path.join(FOLDER, `t08-reel-${id}.part`);
  if (offset === 0) {
    if ((await readdir(/*turbopackIgnore: true*/ FOLDER)).length >= MAX_FILES) return new Response(null, { status: 507 });
    await writeFile(/*turbopackIgnore: true*/ partial, body);
  } else {
    const received = await stat(/*turbopackIgnore: true*/ partial).then((file) => file.size, () => -1);
    if (received !== offset) return new Response(null, { status: 409 });
    await appendFile(/*turbopackIgnore: true*/ partial, body);
  }
  if (offset + length < total) return Response.json({ received: offset + length }, { status: 202 });
  const name = `t08-reel-${new Date().toISOString().replace(/[:.]/g, "-")}-${id}.mp4`;
  await rename(/*turbopackIgnore: true*/ partial, path.join(FOLDER, name));
  return Response.json({ saved: name }, { status: 201 });
}
