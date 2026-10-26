import { beforeEach, describe, expect, it, vi } from "vitest";
import { isSameOrigin, isSameOriginRequest } from "@/lib/auth/same-origin";

// SEC-14: a mutating route handler accepts only the site's own pages, and so does every Server
// Action (the owner's answer of 2026-10-24): Sec-Fetch-Site: same-origin, or an Origin equal to the
// site's, which clients that don't send Sec-Fetch-Site still send.

const SITE = "https://muftah.test";

function request(headers: Record<string, string>): Request {
  return new Request(`${SITE}/api/upload`, { method: "POST", headers });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
});

describe("isSameOriginRequest, and isSameOrigin for a Server Action's headers", () => {
  it.each<[string, Record<string, string>, boolean]>([
    ["Sec-Fetch-Site: same-origin", { "sec-fetch-site": "same-origin" }, true],
    ["the site's Origin, without Sec-Fetch-Site", { origin: SITE }, true],
    ["a same-site page on another host", { "sec-fetch-site": "same-site", origin: "https://shop.muftah.test" }, false],
    // Only a client that isn't a browser sends the site's Origin from another site, and it holds no
    // visitor's cookie: a redirect back to the site makes a browser's Origin null
    ["the site's Origin, under Sec-Fetch-Site: cross-site", { "sec-fetch-site": "cross-site", origin: SITE }, true],
    ["the site's Origin, under Sec-Fetch-Site: same-site", { "sec-fetch-site": "same-site", origin: SITE }, true],
    ["a cross-site page", { "sec-fetch-site": "cross-site", origin: "https://other.test" }, false],
    ["a typed URL, with no Origin", { "sec-fetch-site": "none" }, false],
    ["Origin: null", { origin: "null" }, false],
    ["the site on another port", { origin: "https://muftah.test:8443" }, false],
    ["the site over http", { origin: "http://muftah.test" }, false],
    ["a host that starts with the site's", { origin: "https://muftah.test.other.example" }, false],
    ["a host the site's starts with", { origin: "https://muftah.tes" }, false],
    ["no headers at all", {}, false],
  ])("%s → %s", (_case, headers, expected) => {
    expect(isSameOriginRequest(request(headers))).toBe(expected);
    expect(isSameOrigin(new Headers(headers))).toBe(expected);
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
