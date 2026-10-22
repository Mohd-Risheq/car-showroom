import { isLocalStorageEnabled } from "@/lib/storage/driver";
import { serveLocalFile } from "@/lib/storage/local";

// Files in the local store (BUILD-PLAN §6.3). Not found on deployments.
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/storage-local/files/[...path]">,
): Promise<Response> {
  if (!isLocalStorageEnabled()) return new Response(null, { status: 404 });
  const { path } = await ctx.params;
  return serveLocalFile(path);
}
