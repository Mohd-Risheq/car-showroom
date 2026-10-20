import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isSameOriginRequest } from "@/lib/auth/same-origin";

// SEC-14: a mutating route handler accepts only the site's own pages. Browsers say so with
// Sec-Fetch-Site; for clients that don't send it, the Origin must be the site's own.

const SITE = "https://muftah.test";

function request(headers: Record<string, string>): Request {
  return new Request(`${SITE}/api/upload`, { method: "POST", headers });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isSameOriginRequest", () => {
  it.each<[string, Record<string, string>, boolean]>([
    ["Sec-Fetch-Site: same-origin", { "sec-fetch-site": "same-origin" }, true],
    ["the site's Origin, without Sec-Fetch-Site", { origin: SITE }, true],
    ["a same-site page on another host", { "sec-fetch-site": "same-site", origin: "https://shop.muftah.test" }, false],
    ["a cross-site page", { "sec-fetch-site": "cross-site", origin: "https://other.test" }, false],
    ["a typed URL, with no Origin", { "sec-fetch-site": "none" }, false],
    ["Origin: null", { origin: "null" }, false],
    ["the site on another port", { origin: "https://muftah.test:8443" }, false],
    ["the site over http", { origin: "http://muftah.test" }, false],
    ["no headers at all", {}, false],
  ])("%s → %s", (_case, headers, expected) => {
    expect(isSameOriginRequest(request(headers))).toBe(expected);
  });

  it("compares origins, so a site URL with a path still matches", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", `${SITE}/`);
    expect(isSameOriginRequest(request({ origin: SITE }))).toBe(true);
  });

  it("accepts only Sec-Fetch-Site when the site's URL is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined);
    expect(isSameOriginRequest(request({ origin: SITE }))).toBe(false);
    expect(isSameOriginRequest(request({ "sec-fetch-site": "same-origin" }))).toBe(true);
  });
});
