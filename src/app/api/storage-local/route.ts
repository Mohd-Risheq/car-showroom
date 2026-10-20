import { isLocalStorageEnabled } from "@/lib/storage/driver";
import { handleLocalPut } from "@/lib/storage/local";

// The local store's upload endpoint (BUILD-PLAN §6.3). Not found on deployments.
export async function PUT(request: Request): Promise<Response> {
  if (!isLocalStorageEnabled()) return new Response(null, { status: 404 });
  return handleLocalPut(request);
}
