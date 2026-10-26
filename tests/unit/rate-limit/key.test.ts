import { describe, expect, it, vi } from "vitest";
import { networkSubject, rateLimitKey, rateLimitSecret } from "@/lib/rate-limit/key";

// SEC-12: a key is HMAC-SHA256(K_month, scope | route | subject), with K_month =
// HMAC-SHA256(RATE_LIMIT_HMAC_SECRET, "YYYY-MM"), so ENT-RateLimit holds no IP or email and keys
// rotate monthly without a redeploy

const SECRET = "unit-test-secret-not-a-real-one-0123456789";
const USER = { scope: "user", route: "API-10", subject: "0192f5e0-0000-7000-8000-000000000001" } as const;
const OCTOBER = new Date("2026-10-24T09:00:00.000Z");
// Computed with openssl, apart from this code
const IN_OCTOBER = "Sl3c_c51HLVoTfa_KK2pzKQ52cQmRqgEgL1c_s7AMeI";
const IN_NOVEMBER = "QytSsNvKZjAefhQ6cJ6M4BSdGgcNEPKFoVSqvSax2J0";

describe("a rate-limit key", () => {
  it("is the HMAC of scope|route|subject under the month's key, in base64url", () => {
    expect(rateLimitKey(SECRET, USER, OCTOBER)).toBe(IN_OCTOBER);
  });

  it("changes with the month, at midnight UTC on the first", () => {
    expect(rateLimitKey(SECRET, USER, new Date("2026-10-31T23:59:59.999Z"))).toBe(IN_OCTOBER);
    expect(rateLimitKey(SECRET, USER, new Date("2026-11-01T00:00:00.000Z"))).toBe(IN_NOVEMBER);
  });

  it("changes with every part, and with the secret", () => {
    const keys = [
      rateLimitKey(SECRET, USER, OCTOBER),
      rateLimitKey(SECRET, { ...USER, scope: "sandbox" }, OCTOBER),
      rateLimitKey(SECRET, { ...USER, route: "API-11" }, OCTOBER),
      rateLimitKey(SECRET, { ...USER, subject: "0192f5e0-0000-7000-8000-000000000002" }, OCTOBER),
      rateLimitKey(`${SECRET}x`, USER, OCTOBER),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("fits ENT-RateLimit's key column", () => {
    expect(rateLimitKey(SECRET, { scope: "network", route: "API-04", subject: "203.0.113.7" }, OCTOBER)).toMatch(
      /^[A-Za-z0-9_-]{43}$/,
    );
  });

  it("refuses a route that would blur where the parts meet, and an empty part", () => {
    expect(() => rateLimitKey(SECRET, { ...USER, route: "API|10" }, OCTOBER)).toThrow(RangeError);
    expect(() => rateLimitKey(SECRET, { ...USER, route: "" }, OCTOBER)).toThrow(RangeError);
    expect(() => rateLimitKey(SECRET, { ...USER, subject: "" }, OCTOBER)).toThrow(RangeError);
  });
});

describe("the secret", () => {
  it("comes from RATE_LIMIT_HMAC_SECRET, read when a key is made", () => {
    expect(rateLimitSecret({ RATE_LIMIT_HMAC_SECRET: SECRET })).toBe(SECRET);
    vi.stubEnv("RATE_LIMIT_HMAC_SECRET", SECRET);
    expect(rateLimitSecret()).toBe(SECRET);
  });

  it("must be set and at least 32 characters long, and an error never shows it", () => {
    expect(() => rateLimitSecret({})).toThrow(/RATE_LIMIT_HMAC_SECRET/);
    expect(() => rateLimitSecret({ RATE_LIMIT_HMAC_SECRET: "" })).toThrow(/RATE_LIMIT_HMAC_SECRET/);
    const short = "s".repeat(31);
    expect(() => rateLimitSecret({ RATE_LIMIT_HMAC_SECRET: short })).toThrow(/RATE_LIMIT_HMAC_SECRET/);
    expect(() => rateLimitSecret({ RATE_LIMIT_HMAC_SECRET: short })).not.toThrow(short);
    expect(rateLimitSecret({ RATE_LIMIT_HMAC_SECRET: "s".repeat(32) })).toBe("s".repeat(32));
  });
});

describe("the network subject", () => {
  it("is an IPv4 address as it stands, also inside an IPv4-mapped IPv6 address", () => {
    expect(networkSubject("203.0.113.7")).toBe("203.0.113.7");
    expect(networkSubject("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(networkSubject("::FFFF:cb00:7107")).toBe("203.0.113.7");
  });

  it("is the /64 prefix of an IPv6 address, written out in full", () => {
    expect(networkSubject("2001:db8:1:2:3:4:5:6")).toBe("2001:0db8:0001:0002::/64");
    expect(networkSubject("2001:DB8:1:2::ab")).toBe("2001:0db8:0001:0002::/64");
  });

  it("expands :: wherever it stands", () => {
    expect(networkSubject("::")).toBe("0000:0000:0000:0000::/64");
    expect(networkSubject("::1")).toBe("0000:0000:0000:0000::/64");
    expect(networkSubject("2001:db8::1")).toBe("2001:0db8:0000:0000::/64");
    expect(networkSubject("2001:db8:1::")).toBe("2001:0db8:0001:0000::/64");
    expect(networkSubject("1::2:3:4:5:6")).toBe("0001:0000:0000:0002::/64");
    expect(networkSubject("64:ff9b::192.0.2.33")).toBe("0064:ff9b:0000:0000::/64");
  });

  it("gives every address of one /64 one subject, and drops a zone", () => {
    expect(networkSubject("2001:db8:1:2:ffff::1")).toBe(networkSubject("2001:db8:1:2::abcd"));
    expect(networkSubject("2001:db8:1:3::1")).not.toBe(networkSubject("2001:db8:1:2::1"));
    expect(networkSubject("fe80::1%eth0")).toBe("fe80:0000:0000:0000::/64");
  });

  it("is null for anything that isn't an address", () => {
    for (const text of ["", "localhost", "1.2.3", "300.1.1.1", "01.2.3.4", "[::1]", " 1.2.3.4", "1:2:3:4:5:6:7:8:9"]) {
      expect(networkSubject(text), text).toBeNull();
    }
  });
});
