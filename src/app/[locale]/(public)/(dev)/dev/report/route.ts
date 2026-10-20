import { randomBytes } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isSameOriginRequest } from "@/lib/auth/same-origin";
import { isDeployment } from "@/lib/dev-only";
import { readCapped } from "@/lib/storage/stream";

// Spike pages send their results here during the owner's phone session (BUILD-PLAN §4), so the
// evidence holds the device's own numbers. Each report becomes a JSON file in the git-ignored
// .dev-reports/ folder. Not found on deployments, here and in the proxy.
const FOLDER = path.join(process.cwd(), ".dev-reports");
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_FILES = 200;
const KIND = /^[a-z0-9-]{1,40}$/;

export async function POST(request: Request): Promise<Response> {
  if (isDeployment()) return new Response(null, { status: 404 });
  if (!isSameOriginRequest(request)) return new Response(null, { status: 403 });
  const body = await readCapped(request.body, MAX_BYTES);
  if (body === "too_large") return new Response(null, { status: 413 });
  let report: unknown;
  try {
    report = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return new Response(null, { status: 400 });
  }
  const kind = typeof report === "object" && report !== null ? (report as { kind?: unknown }).kind : undefined;
  if (typeof kind !== "string" || !KIND.test(kind)) return new Response(null, { status: 400 });
  await mkdir(/*turbopackIgnore: true*/ FOLDER, { recursive: true });
  if ((await readdir(/*turbopackIgnore: true*/ FOLDER)).length >= MAX_FILES) return new Response(null, { status: 507 });
  const name = `${kind}-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(3).toString("hex")}.json`;
  await writeFile(/*turbopackIgnore: true*/ path.join(FOLDER, name), `${JSON.stringify(report, null, 2)}\n`);
  return Response.json({ saved: name }, { status: 201 });
}
