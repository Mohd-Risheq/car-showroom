import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { blobStoreHost, createNonce, dealerPolicy } from "@/lib/csp/policy";
import { isDeployment } from "@/lib/deployment";

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

  const hasLocalePrefix = routing.locales.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );
  if (hasLocalePrefix) return NextResponse.next();

  // Unprefixed path: redirect (307) to the same path under the default locale.
  // T-15 completes FR-01.2 with the NEXT_LOCALE cookie (BR-01).
  const url = request.nextUrl.clone();
  url.pathname = `/${routing.defaultLocale}${pathname === "/" ? "" : pathname}`;
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
