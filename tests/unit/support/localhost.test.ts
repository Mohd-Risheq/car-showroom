import dns from "node:dns";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { answerLocalhost } from "../../support/localhost.ts";

// localhost as Playwright's processes look it up (D-049): Playwright's tunnel asks for it once per
// address family for each connection a browser in the Linux image opens, and the answer must not
// wait on the system's resolver, which on a Mac now and then takes 5 s over its IPv6 address

const IPV6 = { address: "::1", family: 6 };
const IPV4 = { address: "127.0.0.1", family: 4 };
const resolverLookup = dns.promises.lookup;
const defaultOrder = dns.getDefaultResultOrder();
let asked: unknown[][];

function setLookup(lookup: unknown): void {
  Object.defineProperty(dns.promises, "lookup", { value: lookup, writable: true, configurable: true });
}

beforeEach(() => {
  asked = [];
  // A resolver that answers with an address no lookup of localhost may give, so an answer from it shows
  setLookup((...args: unknown[]) => {
    asked.push(args);
    return Promise.resolve({ address: "192.0.2.1", family: 4 });
  });
  answerLocalhost();
});

afterEach(() => {
  setLookup(resolverLookup);
  dns.setDefaultResultOrder(defaultOrder);
});

describe("answerLocalhost", () => {
  it("answers localhost in each family, as Playwright's tunnel asks for it, without the resolver", async () => {
    await expect(dns.promises.lookup("localhost", { all: true, family: 6 })).resolves.toStrictEqual([IPV6]);
    await expect(dns.promises.lookup("localhost", { all: true, family: 4 })).resolves.toStrictEqual([IPV4]);
    expect(asked).toStrictEqual([]);
  });

  it("answers one address unless asked for all, in any case and either family's spelling", async () => {
    await expect(dns.promises.lookup("localhost", 4)).resolves.toStrictEqual(IPV4);
    await expect(dns.promises.lookup("LocalHost", { family: "IPv6" })).resolves.toStrictEqual(IPV6);
    await expect(dns.promises.lookup("localhost", { all: true, family: "IPv4" })).resolves.toStrictEqual([IPV4]);
    expect(asked).toStrictEqual([]);
  });

  it("answers both families in the order asked for, or the default one", async () => {
    await expect(dns.promises.lookup("localhost", { all: true, order: "ipv4first" })).resolves.toStrictEqual([
      IPV4,
      IPV6,
    ]);
    await expect(dns.promises.lookup("localhost", { all: true, order: "ipv6first" })).resolves.toStrictEqual([
      IPV6,
      IPV4,
    ]);
    // Verbatim is the resolver's own order, which puts the IPv6 loopback first (RFC 6724)
    await expect(dns.promises.lookup("localhost", { all: true, order: "verbatim" })).resolves.toStrictEqual([
      IPV6,
      IPV4,
    ]);
    dns.setDefaultResultOrder("ipv4first");
    await expect(dns.promises.lookup("localhost", { all: true })).resolves.toStrictEqual([IPV4, IPV6]);
    await expect(dns.promises.lookup("localhost")).resolves.toStrictEqual(IPV4);
    expect(asked).toStrictEqual([]);
  });

  it("asks the resolver for every other name, as it was asked", async () => {
    await expect(dns.promises.lookup("example.com", { all: true, family: 6 })).resolves.toStrictEqual({
      address: "192.0.2.1",
      family: 4,
    });
    await dns.promises.lookup("localhost.example.com", 4);
    expect(asked).toStrictEqual([
      ["example.com", { all: true, family: 6 }],
      ["localhost.example.com", 4],
    ]);
  });

  it("leaves a family localhost has no address of to the resolver, which refuses it", async () => {
    setLookup(resolverLookup);
    answerLocalhost();
    await expect(dns.promises.lookup("localhost", 5)).rejects.toThrow(/family/);
  });
});
