import "server-only";

// SEC-14: a mutating route handler (API-03, API-16, API-34) accepts only the site's own pages, and so
// does every Server Action (the owner's answer of 2026-10-24, D-043): Sec-Fetch-Site: same-origin, or
// an Origin equal to the site's, which clients that don't send Sec-Fetch-Site still send.
export function isSameOrigin(headers: Headers): boolean {
  if (headers.get("sec-fetch-site") === "same-origin") return true;
  const origin = headers.get("origin");
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  return origin !== null && site !== undefined && origin === new URL(site).origin;
}

export function isSameOriginRequest(request: Request): boolean {
  return isSameOrigin(request.headers);
}
