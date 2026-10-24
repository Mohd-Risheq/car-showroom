import {
  getRedirectUrl,
  getRewrittenUrl,
  isRewrite,
  unstable_doesMiddlewareMatch,
} from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { LOCALE_COOKIE } from "@/lib/i18n/locale-cookie";
import { routing } from "@/lib/i18n/routing";

// src/proxy.ts (SRS §11.5 rule 1, §12.5, FR-01.2, BUILD-PLAN §9.1): which paths run it, the dev
// pages' hard 404 on deployments, the dealer nonce policy, the locale redirect and other locales'
// prefixes.

const ORIGIN = "https://muftah.test";
const DEV_PATHS = routing.locales.flatMap((locale) => [
  `/${locale}/dev`,
  `/${locale}/dev/spin`,
  `/${locale}/dealer/dev`,
  `/${locale}/dealer/dev/vin`,
]);

// The proxy reads its environment when it loads, so each test loads it after stubbing
async function loadProxy(env: Record<string, string | undefined> = {}) {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  vi.resetModules();
  return import("@/proxy");
}

function request(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`, { headers });
}

const passedOn = (response: Response) => response.headers.get("x-middleware-next") === "1";
const nonceOf = (policy: string | null) => policy?.match(/'nonce-([^']+)'/)?.[1];

describe("which paths run the proxy", () => {
  it.each([
    "/",
    "/cars",
    "/cars/toyota",
    "/fr/cars",
    "/ar-JO/cars",
    "/ar/dealer",
    "/en/dealer/cars",
    "/ar/dev",
    "/en/dev/spin",
    "/en/dealer/dev/vin",
  ])("runs on %s", async (url) => {
    const { config } = await loadProxy();
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
  });

  it.each([
    "/ar",
    "/en/cars",
    "/ar/cars/toyota-rav4",
    "/api/upload",
    "/api/auth/get-session",
    "/_next/static/chunk.js",
    "/favicon.ico",
    "/maps/land-110m.svg",
  ])("leaves %s alone", async (url) => {
    const { config } = await loadProxy();
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
  });

  // Next.js reads the matcher at build time, so its locales are literals that must follow routing.ts
  it("names exactly the app's locales in its matcher", async () => {
    const { config } = await loadProxy();
    const locales = routing.locales.join("|");
    const unprefixed = routing.locales.map((locale) => `${locale}(?:/|$)`).join("|");
    expect(config.matcher).toEqual([
      `/((?!${unprefixed}|api(?:/|$)|_next/|_vercel(?:/|$)|.*\\..*).*)`,
      `/:locale(${locales})/dealer/:path*`,
      `/:locale(${locales})/dev/:path*`,
    ]);
  });
});

describe("dev pages", () => {
  it.each(["production", "preview"])("answer 404 on a %s deployment", async (env) => {
    const { proxy } = await loadProxy({ VERCEL_ENV: env });
    for (const path of DEV_PATHS) expect(proxy(request(path)).status, path).toBe(404);
  });

  it("are served when VERCEL_ENV is unset", async () => {
    const { proxy } = await loadProxy({ VERCEL_ENV: undefined });
    for (const path of DEV_PATHS) expect(passedOn(proxy(request(path))), path).toBe(true);
  });

  it("keep the dealer policy on a dealer dev 404", async () => {
    const { proxy } = await loadProxy({ VERCEL_ENV: "production" });
    const response = proxy(request("/en/dealer/dev/reel"));
    expect(response.status).toBe(404);
    expect(nonceOf(response.headers.get("content-security-policy"))).toBeDefined();
  });
});

describe("dealer pages", () => {
  it("get a fresh nonce in the response policy and the request headers, never the client's", async () => {
    const { proxy } = await loadProxy();
    const forged = { "x-nonce": "attacker", "content-security-policy": "script-src *" };
    const first = proxy(request("/ar/dealer", forged));
    const second = proxy(request("/ar/dealer", forged));

    const policy = first.headers.get("content-security-policy");
    const nonce = nonceOf(policy);
    expect(passedOn(first)).toBe(true);
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(first.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
    expect(first.headers.get("x-middleware-request-content-security-policy")).toBe(policy);
    expect(nonceOf(second.headers.get("content-security-policy"))).not.toBe(nonce);
  });

  it("leave public pages to next.config.ts's policy", async () => {
    const { proxy } = await loadProxy();
    const response = proxy(request("/en/cars"));
    expect(passedOn(response)).toBe(true);
    expect(response.headers.get("content-security-policy")).toBeNull();
  });
});

describe("unprefixed paths (FR-01.2, BR-01)", () => {
  it.each([
    ["/", `${ORIGIN}/ar`],
    ["/cars", `${ORIGIN}/ar/cars`],
    ["/cars/toyota?sort=price", `${ORIGIN}/ar/cars/toyota?sort=price`],
    ["/c/MU-24Q7", `${ORIGIN}/ar/c/MU-24Q7`],
  ])("redirect %s to the default locale", async (path, target) => {
    const { proxy } = await loadProxy();
    const response = proxy(request(path));
    expect(response.status).toBe(307);
    expect(getRedirectUrl(response)).toBe(target);
  });

  it("redirect to the locale the visitor chose, with the query", async () => {
    const { proxy } = await loadProxy();
    expect(getRedirectUrl(proxy(request("/", { cookie: `${LOCALE_COOKIE}=en` })))).toBe(`${ORIGIN}/en`);
    expect(getRedirectUrl(proxy(request("/cars?fuel=hybrid", { cookie: `a=1; ${LOCALE_COOKIE}=en` })))).toBe(
      `${ORIGIN}/en/cars?fuel=hybrid`,
    );
    expect(getRedirectUrl(proxy(request("/cars", { cookie: `${LOCALE_COOKIE}=ar` })))).toBe(`${ORIGIN}/ar/cars`);
  });

  it("take the default locale when the stored choice names none of the site's", async () => {
    const { proxy } = await loadProxy();
    for (const value of ["fr", "EN", "en-US", ""]) {
      expect(getRedirectUrl(proxy(request("/", { cookie: `${LOCALE_COOKIE}=${value}` }))), value).toBe(`${ORIGIN}/ar`);
    }
  });

  // Google's guidance against redirects that guess the language (FR-01.2a)
  it("never follow the browser's language, and never store a choice", async () => {
    const { proxy } = await loadProxy();
    const response = proxy(request("/", { "accept-language": "en-US,en;q=0.9" }));
    expect(getRedirectUrl(response)).toBe(`${ORIGIN}/ar`);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("other locales' prefixes (FR-01's edge cases)", () => {
  it.each(["/fr/cars", "/fr", "/de-AT/cars?sort=price", "/en_GB", "/AR/cars"])(
    "answer %s from the default locale's pages, which have no page for it: a 404 in Arabic",
    async (path) => {
      const { proxy } = await loadProxy();
      const response = proxy(request(path, { cookie: `${LOCALE_COOKIE}=en` }));
      expect(isRewrite(response)).toBe(true);
      expect(getRewrittenUrl(response)).toBe(`${ORIGIN}/ar${path}`);
    },
  );
});
