import { DEV_REPORTS_FOLDER, handleDevMp4Part } from "@/app/_dev/report-folder";
import { isDeployment } from "@/lib/deployment";

// The MP4 a phone made in spike T-08, saved next to the JSON reports in the git-ignored
// .dev-reports/ folder, so ffprobe and AVFoundation can check the device's own file. It comes in
// parts, in order (src/app/_dev/report-folder.ts). Not found on deployments, here and in the
// proxy.
export async function POST(request: Request): Promise<Response> {
  if (isDeployment()) return new Response(null, { status: 404 });
  return handleDevMp4Part(request, DEV_REPORTS_FOLDER);
}
