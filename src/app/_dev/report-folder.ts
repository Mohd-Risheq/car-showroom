import "server-only";
import { randomBytes } from "node:crypto";
import { appendFile, mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { isSameOriginRequest } from "@/lib/auth/same-origin";
import { readCapped } from "@/lib/http/body";
import { isMp4Start, type Mp4Part, mp4PartOf } from "./mp4-parts";
import { DEV_REPORT_KINDS, type DevReportKind, type SavedReply } from "./report";

// What the two report routes take from the spike pages during the owner's phone session
// (./report.ts): each JSON report, and a reel's MP4 in parts, saved in the git-ignored
// .dev-reports/ folder so the evidence holds the device's own numbers and file. The routes answer
// 404 on deployments and pass the folder in, so the tests use a temporary one. The file calls
// carry turbopackIgnore: reports are local data, never traced into a build.

/** .dev-reports/ in the project, where the routes save */
export const DEV_REPORTS_FOLDER = path.join(process.cwd(), ".dev-reports");

/** The folder takes no new file once it holds this many */
export const MAX_REPORT_FILES = 200;

const MAX_REPORT_BYTES = 4 * 1024 * 1024;

/** An upload with no new part for this long was abandoned, so its partial file is removed */
const STALE_PART_MS = 60 * 60 * 1000;

// The uploads with a part being written. Another part of the same upload meanwhile is refused,
// so two parts can't both pass the offset check and append.
const writing = new Set<string>();

/** Takes a JSON report and saves it as received, named for its kind and the time */
export async function handleDevReport(request: Request, folder: string): Promise<Response> {
  if (!isSameOriginRequest(request)) return new Response(null, { status: 403 });
  const body = await readCapped(request.body, MAX_REPORT_BYTES);
  if (body === "too_large") return new Response(null, { status: 413 });
  const kind = kindOf(body);
  if (kind === undefined) return new Response(null, { status: 400 });
  await mkdir(/*turbopackIgnore: true*/ folder, { recursive: true });
  if (await isFull(folder)) return new Response(null, { status: 507 });
  const name = `${kind}-${timestamp()}-${randomBytes(3).toString("hex")}.json`;
  // Stored as received, so a file is never larger than the capped request
  await writeFile(/*turbopackIgnore: true*/ path.join(folder, name), body);
  return savedReply(name);
}

/**
 * Takes one part of a reel's MP4 (./mp4-parts.ts). The parts come in order: the first starts a
 * partial file, each later one must find the file ending where it starts, and the file gets its
 * .mp4 name once its last byte is in.
 */
export async function handleDevMp4Part(request: Request, folder: string): Promise<Response> {
  if (!isSameOriginRequest(request)) return new Response(null, { status: 403 });
  if (request.headers.get("content-type") !== "video/mp4") return new Response(null, { status: 415 });
  const part = mp4PartOf(new URL(request.url).searchParams);
  if (!part) return new Response(null, { status: 400 });
  const body = await readCapped(request.body, part.length);
  if (body === "too_large") return new Response(null, { status: 413 });
  if (body.byteLength !== part.length) return new Response(null, { status: 400 });
  if (part.offset === 0 && !isMp4Start(body)) return new Response(null, { status: 400 });
  if (writing.has(part.id)) return new Response(null, { status: 409 });
  writing.add(part.id);
  try {
    return await savePart(folder, part, body);
  } finally {
    writing.delete(part.id);
  }
}

async function savePart(folder: string, part: Mp4Part, body: Uint8Array): Promise<Response> {
  // The total is in the name, so a part that declares another total finds no file
  const partial = path.join(folder, `t08-reel-${part.id}-${part.total}.part`);
  if (part.offset === 0) {
    await mkdir(/*turbopackIgnore: true*/ folder, { recursive: true });
    await removeStaleParts(folder);
    if (await isFull(folder)) return new Response(null, { status: 507 });
    await writeFile(/*turbopackIgnore: true*/ partial, body);
  } else {
    if ((await sizeOf(partial)) !== part.offset) return new Response(null, { status: 409 });
    await appendFile(/*turbopackIgnore: true*/ partial, body);
  }
  const end = part.offset + part.length;
  if (end < part.total) return Response.json({ received: end }, { status: 202 });
  // Another upload's start removes a partial idle for an hour. If that happens while this part is
  // written, the append makes a new file holding this part alone, or the rename finds none, and
  // either way the upload is refused rather than saved short.
  if ((await sizeOf(partial)) !== part.total) return new Response(null, { status: 409 });
  const name = `t08-reel-${timestamp()}-${part.id}.mp4`;
  try {
    await rename(/*turbopackIgnore: true*/ partial, path.join(folder, name));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return new Response(null, { status: 409 });
    }
    throw error;
  }
  return savedReply(name);
}

/** The spike kind a report names, or undefined when it isn't JSON or names no spike's kind */
function kindOf(body: Uint8Array): DevReportKind | undefined {
  let report: unknown;
  try {
    report = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return undefined;
  }
  const kind = typeof report === "object" && report !== null && "kind" in report ? report.kind : undefined;
  return DEV_REPORT_KINDS.find((known) => known === kind);
}

async function isFull(folder: string): Promise<boolean> {
  return (await readdir(/*turbopackIgnore: true*/ folder)).length >= MAX_REPORT_FILES;
}

// Each part rewrites its file's modified time, so an upload still under way is never removed
async function removeStaleParts(folder: string): Promise<void> {
  const now = Date.now();
  for (const name of await readdir(/*turbopackIgnore: true*/ folder)) {
    if (!name.endsWith(".part")) continue;
    const file = path.join(folder, name);
    // A file that has gone since the listing (its upload finished meanwhile) is left alone
    const modified = await stat(/*turbopackIgnore: true*/ file).then(
      (entry) => entry.mtimeMs,
      () => now,
    );
    if (now - modified > STALE_PART_MS) await rm(/*turbopackIgnore: true*/ file, { force: true });
  }
}

/** A file's size, or undefined when it isn't there */
function sizeOf(file: string): Promise<number | undefined> {
  return stat(/*turbopackIgnore: true*/ file).then(
    (entry) => entry.size,
    () => undefined,
  );
}

/** The time as part of a file name: ISO, with no colons or dots */
const timestamp = () => new Date().toISOString().replace(/[:.]/g, "-");

const savedReply = (name: string) => Response.json({ saved: name } satisfies SavedReply, { status: 201 });
