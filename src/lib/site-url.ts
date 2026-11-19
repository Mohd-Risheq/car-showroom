// SRS §15.1's NEXT_PUBLIC_SITE_URL: the site's canonical origin, which the local store's addresses,
// a car page's shared link (FR-09.11) and SEC-14's origin check take. A browser has it too, built
// into its scripts.

/** The site's origin, from NEXT_PUBLIC_SITE_URL, whatever path it is written with; null while unset */
export function siteOriginOrNull(): string | null {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  return site ? new URL(site).origin : null;
}

/** The site's origin, for what can't do without it */
export function siteOrigin(): string {
  const origin = siteOriginOrNull();
  if (origin === null) throw new Error("NEXT_PUBLIC_SITE_URL is not set (SRS §15.1)");
  return origin;
}

/** A page's canonical address: the site's origin and the page's path */
export function siteUrl(path: `/${string}`): string {
  return new URL(path, siteOrigin()).href;
}
