import { NextResponse, type NextRequest } from "next/server";
import { blobStoreHost, createNonce, dealerPolicy } from "@/lib/csp/policy";
import { isDeployment } from "@/lib/deployment";
import { chosenLocale, LOCALE_COOKIE } from "@/lib/i18n/locale-cookie";
import { localePrefixOf, pathInLocale } from "@/lib/i18n/locale-path";
import { routing } from "@/lib/i18n/routing";

// Any one locale, as a group
const LOCALE = `(?:${routing.locales.join("|")})`;
// The (dev) route groups: /{locale}/dev/** and /{locale}/dealer/dev/**
const DEV_PATH = new RegExp(`^/${LOCALE}(?:/dealer)?/dev(?:/|$)`);
// The dealer workspace and its auth pages: /{locale}/dealer/**
const DEALER_PATH = new RegExp(`^/${LOCALE}/dealer(?:/|$)`);

// Read once, so a bad BLOB_STORE_HOST stops the server instead of failing each request
const POLICY_OPTIONS = {
  store: blobStoreHost(process.env.BLOB_STORE_HOST),
  development: process.env.NODE_ENV === "development",
};

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // A hard 404 here, because a notFound() thrown below a streaming root layout can only
  // send a 200 with noindex (DECISIONS.md D-012)
  const devPathOnDeployment = DEV_PATH.test(pathname) && isDeployment();

  // T-28 adds the auth redirect for dealer paths
  if (DEALER_PATH.test(pathname)) return withDealerPolicy(request, devPathOnDeployment);
  if (devPathOnDeployment) return new NextResponse(null, { status: 404 });

  const prefix = localePrefixOf(pathname);
  if (prefix.kind === "site") return NextResponse.next();

  const url = request.nextUrl.clone();
  if (prefix.kind === "other") {
    // Another locale's prefix, such as /fr/cars, is a 404 in the default locale (FR-01's edge cases):
    // the default locale's pages answer it as they answer any path they have no page for. Passed on,
    // it would get Next.js's own 404, which has no language (DECISIONS.md D-041).
    url.pathname = pathInLocale(pathname, "", routing.defaultLocale);
    return NextResponse.rewrite(url);
  }

  // An unprefixed path is redirected (307), with its query, to the visitor's chosen locale, or the
  // default one (FR-01.2, BR-01). Never by the browser's language, and storing no choice, so the
  // English prompt can still offer itself (FR-01.2a).
  const locale = chosenLocale(request.cookies.get(LOCALE_COOKIE)?.value) ?? routing.defaultLocale;
  url.pathname = pathInLocale(pathname, "", locale);
  return NextResponse.redirect(url, 307);
}

// A fresh nonce for every dealer response (SRS §12.5). Next.js reads it from the policy on the
// request and puts it on its scripts. The dealer root layout reads x-nonce for libraries that
// render inline tags. Both request headers are overwritten, never taken from the client.
function withDealerPolicy(request: NextRequest, notFound: boolean): NextResponse {
  const nonce = createNonce();
  const policy = dealerPolicy(nonce, POLICY_OPTIONS);
  let response: NextResponse;
  if (notFound) {
    response = new NextResponse(null, { status: 404 });
  } else {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("content-security-policy", policy);
    response = NextResponse.next({ request: { headers } });
  }
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

// Only unprefixed paths, the dealer workspace and the dev pages run the proxy, so cached
// public pages, /api, Next internals and files are served without it (SRS §11.5 rule 1).
// Next.js reads the matcher at build time, so its values must be literals and the locales are
// spelled out here; tests/unit/proxy.test.ts checks them against routing.locales.
export const config = {
  matcher: [
    "/((?!ar(?:/|$)|en(?:/|$)|api(?:/|$)|_next/|_vercel(?:/|$)|.*\\..*).*)",
    "/:locale(ar|en)/dealer/:path*",
    "/:locale(ar|en)/dev/:path*",
  ],
};
