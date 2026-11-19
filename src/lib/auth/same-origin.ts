import "server-only";
import { siteOriginOrNull } from "@/lib/site-url";

// SEC-14: a mutating route handler (API-03, API-16, API-34) accepts only the site's own pages, and so
// does every Server Action (the owner's answer of 2026-10-24, D-043): Sec-Fetch-Site: same-origin, or
// an Origin equal to the site's, which clients that don't send Sec-Fetch-Site still send. While the
// site's address is unset, only Sec-Fetch-Site counts.
export function isSameOrigin(headers: Headers): boolean {
  if (headers.get("sec-fetch-site") === "same-origin") return true;
  const origin = headers.get("origin");
  return origin !== null && origin === siteOriginOrNull();
}

export function isSameOriginRequest(request: Request): boolean {
  return isSameOrigin(request.headers);
}
