import "server-only";

// SEC-14: a mutating route handler (API-03, API-16) accepts only the site's own pages,
// shown by Sec-Fetch-Site or, for clients that don't send it, an Origin equal to the site's
export function isSameOriginRequest(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "same-origin") return true;
  const origin = request.headers.get("origin");
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  return origin !== null && site !== undefined && origin === new URL(site).origin;
}
