import { describe, expect, it } from "vitest";
import { clientNetwork, SHARED_NETWORK } from "@/lib/rate-limit/client-network";

// SEC-12: the network a request counts under, from the address the platform puts in x-real-ip
// (ipAddress() of @vercel/functions), or one shared bucket when there is none (D-043)

const request = (headers: Record<string, string>) => new Request("http://localhost:3000/api/events", { headers });

describe("clientNetwork", () => {
  it("is an IPv4 address itself", () => {
    expect(clientNetwork(request({ "x-real-ip": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("is an IPv6 address's /64", () => {
    expect(clientNetwork(request({ "x-real-ip": "2001:db8:1:2:3:4:5:6" }))).toBe("2001:0db8:0001:0002::/64");
  });

  it("reads the platform's header alone, never one a client may set on its way in", () => {
    expect(clientNetwork(request({ "x-forwarded-for": "203.0.113.7" }))).toBe(SHARED_NETWORK);
  });

  it.each([
    ["no address", {}],
    ["one that isn't an address", { "x-real-ip": "localhost" }],
  ])("counts a request with %s in the shared bucket, never in none", (_, headers) => {
    expect(clientNetwork(request(headers))).toBe(SHARED_NETWORK);
  });

  it("names the shared bucket as no network is named", () => {
    expect(SHARED_NETWORK).not.toMatch(/^[\d.]+$|::\/64$/);
  });
});
