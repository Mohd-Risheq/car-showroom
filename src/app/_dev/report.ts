import { describeError } from "./harness";

// The spike pages' channel to the Mac running the server, for the owner's phone session
// (BUILD-PLAN §4). A JSON report goes to /{locale}/dev/report and a reel's MP4 to
// /{locale}/dev/report/mp4, and both routes save into the git-ignored .dev-reports/ folder. The
// pages and the routes share this module, so each request and reply is defined once.

/**
 * Next.js keeps only the first 10 MB of a request body that passes through proxy.ts, as every
 * /{locale}/dev/** request does, and drops the rest without an error (proxyClientMaxBodySize,
 * D-030). So an MP4 goes in parts no bigger than this.
 */
export const DEV_UPLOAD_PART_BYTES = 8 * 1024 * 1024;

/** An MP4 upload's id is this many random bytes, in hex */
export const MP4_ID_BYTES = 6;

/** The spikes that send reports, each under its own kind, which starts the saved file's name */
export const DEV_REPORT_KINDS = [
  "t04-canvas",
  "t05-spin",
  "t07-sound",
  "t08-reel",
  "t09-journey",
  "t10-vin",
  "t11-type",
] as const;

export type DevReportKind = (typeof DEV_REPORT_KINDS)[number];

/** A route's reply once a file is complete: its name in .dev-reports/ */
export type SavedReply = { saved: string };

export function isSavedReply(value: unknown): value is SavedReply {
  return typeof value === "object" && value !== null && "saved" in value && typeof value.saved === "string";
}

/** The line a page shows once it has sent a report, and whether the route took the report */
export type SendOutcome = { ok: boolean; message: string };

/** Sends one report as JSON. It never throws: a failure comes back as the line to show. */
export async function postDevReport(locale: string, report: { kind: DevReportKind }): Promise<SendOutcome> {
  try {
    const response = await fetch(`/${locale}/dev/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(report),
    });
    if (!response.ok) return { ok: false, message: `Sending failed: ${response.status}` };
    // The route saves the file before it replies, so a success means the report is on the Mac
    const saved = await savedName(response);
    return {
      ok: true,
      message: saved === null ? "Sent to the Mac (the reply named no file)" : `Sent to the Mac: ${saved}`,
    };
  } catch (error) {
    return { ok: false, message: `Sending failed: ${describeError(error)}` };
  }
}

/**
 * Sends an MP4 in parts, one after another, and gives the name the Mac saved it under, or null
 * when the last reply named none. It throws at the first part the route refuses.
 */
export async function postDevMp4(locale: string, mp4: ArrayBuffer): Promise<string | null> {
  const id = randomHex(MP4_ID_BYTES);
  let last: Response | null = null;
  for (let offset = 0; offset < mp4.byteLength; offset += DEV_UPLOAD_PART_BYTES) {
    const query = new URLSearchParams({ id, offset: String(offset), total: String(mp4.byteLength) });
    last = await fetch(`/${locale}/dev/report/mp4?${query}`, {
      method: "POST",
      headers: { "content-type": "video/mp4" },
      body: mp4.slice(offset, offset + DEV_UPLOAD_PART_BYTES),
    });
    if (!last.ok) throw new Error(`MP4 ${last.status} at byte ${offset}`);
  }
  return last ? savedName(last) : null;
}

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

async function savedName(response: Response): Promise<string | null> {
  const body: unknown = await response.json().catch(() => null);
  return isSavedReply(body) ? body.saved : null;
}
