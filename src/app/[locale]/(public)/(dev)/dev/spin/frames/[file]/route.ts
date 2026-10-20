import { readFile } from "node:fs/promises";
import path from "node:path";
import { isDeployment } from "@/lib/dev-only";

// The synthetic spin fixture for spike T-05 (Q-04), made by scripts/fixtures/spin-dials.mts in
// the git-ignored .fixtures/spin/ folder. Not found on deployments, here and in the proxy.
const NAME = /^(?:l36|l72|p72)-\d{2}-(?:480|1280)\.(webp|jpg)$/;
const TYPES = { webp: "image/webp", jpg: "image/jpeg" } as const;
const FOLDER = path.join(process.cwd(), ".fixtures", "spin");

export async function GET(_request: Request, ctx: RouteContext<"/[locale]/dev/spin/frames/[file]">): Promise<Response> {
  if (isDeployment()) return new Response(null, { status: 404 });
  const { file } = await ctx.params;
  const extension = NAME.exec(file)?.[1] as keyof typeof TYPES | undefined;
  if (!extension) return new Response(null, { status: 404 });
  let body: Uint8Array<ArrayBuffer>;
  try {
    body = new Uint8Array(await readFile(/*turbopackIgnore: true*/ path.join(FOLDER, file)));
  } catch {
    return new Response(null, { status: 404 });
  }
  // A file name never changes content, so browsers may keep it. A cold run adds a query string.
  return new Response(body, {
    headers: {
      "content-type": TYPES[extension],
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
