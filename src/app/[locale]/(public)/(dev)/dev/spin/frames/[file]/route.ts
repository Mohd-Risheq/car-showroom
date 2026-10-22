import { readFile } from "node:fs/promises";
import path from "node:path";
import { SPIN_FOLDER, spinFrameFormat } from "@/app/_dev/fixtures";
import { isDeployment } from "@/lib/deployment";

// The synthetic spin fixture for spike T-05 (Q-04), made by scripts/fixtures/spin-dials.ts in
// the git-ignored .fixtures/spin/ folder. Not found on deployments, here and in the proxy, so its
// paths carry turbopackIgnore and the build never traces the folder.
const TYPES = { webp: "image/webp", jpg: "image/jpeg" } as const;
const FOLDER = path.join(/*turbopackIgnore: true*/ process.cwd(), SPIN_FOLDER);

export async function GET(_request: Request, ctx: RouteContext<"/[locale]/dev/spin/frames/[file]">): Promise<Response> {
  if (isDeployment()) return new Response(null, { status: 404 });
  const { file } = await ctx.params;
  const format = spinFrameFormat(file);
  if (!format) return new Response(null, { status: 404 });
  let body: Uint8Array<ArrayBuffer>;
  try {
    body = new Uint8Array(await readFile(/*turbopackIgnore: true*/ path.join(FOLDER, file)));
  } catch {
    return new Response(null, { status: 404 });
  }
  // A file name never changes content, so browsers may keep it. A cold run adds a query string.
  return new Response(body, {
    headers: {
      "content-type": TYPES[format],
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
