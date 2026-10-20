import { getScriptNonceFromHeader } from "next/dist/server/app-render/get-script-nonce-from-header";
import { describe, expect, it } from "vitest";
import {
  BOTID_PATH,
  blobStoreHost,
  CSP_REPORT_PATH,
  createNonce,
  dealerPolicy,
  publicPolicy,
  REPORTING_ENDPOINTS,
  securityHeaders,
} from "@/lib/csp/policy";

// SRS §12.5, SEC-15 and SEC-07. Browser behaviour is checked in docs/evidence/T-06.

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(";").map((part) => {
      const [name, ...sources] = part.trim().split(/\s+/);
      return [name as string, sources];
    }),
  );
}

const STORE = "abc123.public.blob.vercel-storage.com";

describe("nonces", () => {
  it("are fresh, 128 bits, and accepted by the installed Next.js", () => {
    const nonces = new Set(Array.from({ length: 1000 }, createNonce));
    expect(nonces.size).toBe(1000);
    for (const nonce of nonces) {
      expect(atob(nonce)).toHaveLength(16);
      // Next.js silently drops a nonce it can't parse, so test against its own parser
      expect(getScriptNonceFromHeader(dealerPolicy(nonce))).toBe(nonce);
    }
  });
});

describe("dealer policy", () => {
  const nonce = createNonce();
  const policy = directives(dealerPolicy(nonce, { store: STORE }));

  it("allows scripts by nonce only, plus the WASM the scanner and HEIC decoder need", () => {
    expect(policy.get("script-src")).toEqual(["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "'wasm-unsafe-eval'"]);
    expect([...policy.keys()].find((name) => name.startsWith("script-src"))).toBe("script-src");
  });

  it("allows inline styles, which the toast library needs, with no nonce to cancel them", () => {
    expect(policy.get("style-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(policy.get("style-src-attr")).toEqual(["'unsafe-inline'"]);
  });

  it("has the store host where media and uploads need it", () => {
    expect(policy.get("img-src")).toEqual(["'self'", "blob:", "data:", `https://${STORE}`]);
    expect(policy.get("media-src")).toEqual(["'self'", "blob:", `https://${STORE}`]);
    expect(policy.get("connect-src")).toEqual(["'self'", "https://vercel.com/api/blob/", `https://${STORE}`]);
    expect(policy.get("worker-src")).toEqual(["'self'", "blob:"]);
  });

  it("adds 'unsafe-eval' in development only", () => {
    expect(directives(dealerPolicy(nonce, { development: true })).get("script-src")).toContain("'unsafe-eval'");
    expect(policy.get("script-src")).not.toContain("'unsafe-eval'");
  });
});

describe("public policy", () => {
  const policy = directives(publicPolicy({ store: STORE }));

  it("has no nonce or hash, which would make browsers ignore 'unsafe-inline'", () => {
    const sources = [...policy.values()].flat();
    expect(sources.filter((source) => /^'(nonce|sha256|sha384|sha512)-/.test(source))).toEqual([]);
    expect(policy.get("script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(policy.get("script-src-attr")).toEqual(["'none'"]);
  });

  it("has the store host for media only, and no worker or upload hosts", () => {
    expect(policy.get("img-src")).toEqual(["'self'", "blob:", "data:", `https://${STORE}`]);
    expect(policy.get("media-src")).toEqual(["'self'", `https://${STORE}`]);
    expect(policy.get("connect-src")).toEqual(["'self'", `https://${STORE}`]);
    expect(policy.has("worker-src")).toBe(false);
  });

  it("leaves the store out when BLOB_STORE_HOST is unset", () => {
    expect(publicPolicy()).not.toContain("https://");
    expect(dealerPolicy(createNonce())).not.toContain("blob.vercel-storage.com");
  });
});

describe("both policies", () => {
  it("end with the same restrictions and reporting", () => {
    for (const policy of [directives(publicPolicy()), directives(dealerPolicy(createNonce()))]) {
      expect(policy.get("default-src")).toEqual(["'self'"]);
      expect(policy.get("object-src")).toEqual(["'none'"]);
      expect(policy.get("base-uri")).toEqual(["'none'"]);
      expect(policy.get("form-action")).toEqual(["'self'"]);
      expect(policy.get("frame-ancestors")).toEqual(["'none'"]);
      expect(policy.get("upgrade-insecure-requests")).toEqual([]);
      expect(policy.get("report-uri")).toEqual([CSP_REPORT_PATH]);
      expect(policy.get("report-to")).toEqual(["csp"]);
    }
  });
});

describe("BLOB_STORE_HOST", () => {
  it("accepts a full host name and nothing else", () => {
    expect(blobStoreHost(STORE)).toBe(STORE);
    expect(blobStoreHost(undefined)).toBeUndefined();
    expect(blobStoreHost("")).toBeUndefined();
    for (const bad of [
      "*.public.blob.vercel-storage.com",
      `https://${STORE}`,
      `${STORE}; script-src *`,
      `${STORE} evil.example`,
      "ABC.public.blob.vercel-storage.com",
      "localhost",
    ]) {
      expect(() => blobStoreHost(bad)).toThrow();
    }
  });
});

describe("security headers", () => {
  it("differ only in Permissions-Policy, and never carry the CSP", () => {
    const pub = new Map(securityHeaders("public").map((header) => [header.key, header.value]));
    const dealer = new Map(securityHeaders("dealer").map((header) => [header.key, header.value]));
    expect(pub.get("Strict-Transport-Security")).toBe("max-age=63072000; includeSubDomains");
    expect(pub.get("X-Frame-Options")).toBe("DENY");
    expect(pub.get("Reporting-Endpoints")).toBe(REPORTING_ENDPOINTS);
    expect(pub.get("Permissions-Policy")).toContain("camera=()");
    expect(dealer.get("Permissions-Policy")).toContain("camera=(self)");
    expect(dealer.get("Permissions-Policy")).not.toContain("geolocation");
    for (const headers of [pub, dealer]) expect(headers.has("Content-Security-Policy")).toBe(false);
    pub.delete("Permissions-Policy");
    dealer.delete("Permissions-Policy");
    expect(dealer).toEqual(pub);
  });

  it("know BotID's proxied path", () => {
    expect(BOTID_PATH).toMatch(/^\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/);
  });
});
