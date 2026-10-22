import { DEV_REPORTS_FOLDER, handleDevReport } from "@/app/_dev/report-folder";
import { isDeployment } from "@/lib/deployment";

// Spike pages send their results here during the owner's phone session (BUILD-PLAN §4), so the
// evidence holds the device's own numbers. Each report becomes a JSON file in the git-ignored
// .dev-reports/ folder (src/app/_dev/report-folder.ts). Not found on deployments, here and in the
// proxy.
export async function POST(request: Request): Promise<Response> {
  if (isDeployment()) return new Response(null, { status: 404 });
  return handleDevReport(request, DEV_REPORTS_FOLDER);
}
