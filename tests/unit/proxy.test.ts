import { getRedirectUrl, unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { routing } from "@/i18n/routing";

// src/proxy.ts (SRS §11.5 rule 1, §12.5, FR-01.2, BUILD-PLAN §9.1): which paths run it, the dev
// pages' hard 404 on deployments, the dealer nonce policy and the locale redirect.

const ORIGIN = "https://muftah.test";
const DEV_PATHS = routing.locales.flatMap((locale) => [`/${locale}/dev`, `/${locale}/dev/spin`, `/${locale}/dealer/dev`, `/${locale}/dealer/dev/vin`]);

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

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("which paths run the proxy", () => {
  it.each(["/", "/cars", "/cars/toyota", "/ar/dealer", "/en/dealer/cars", "/ar/dev", "/en/dev/spin", "/en/dealer/dev/vin"])(
    "runs on %s",
    async (url) => {
      const { config } = await loadProxy();
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
    },
  );

  it.each(["/ar", "/en/cars", "/ar/cars/toyota-rav4", "/api/upload", "/api/auth/get-session", "/_next/static/chunk.js", "/favicon.ico", "/maps/land-110m.svg"])(
    "leaves %s alone",
    async (url) => {
      const { config } = await loadProxy();
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
    },
  );

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

describe("unprefixed paths (FR-01.2)", () => {
  it.each([
    ["/", `${ORIGIN}/ar`],
    ["/cars", `${ORIGIN}/ar/cars`],
    ["/cars/toyota?sort=price", `${ORIGIN}/ar/cars/toyota?sort=price`],
  ])("redirect %s to the default locale", async (path, target) => {
    const { proxy } = await loadProxy();
    const response = proxy(request(path));
    expect(response.status).toBe(307);
    expect(getRedirectUrl(response)).toBe(target);
  });
});
