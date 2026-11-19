// localhost, answered in Playwright's own processes rather than asked of the system's resolver
// (D-049). With pnpm e2e:linux the browsers run in Playwright's Linux image and reach this machine's
// localhost through a tunnel whose near end is each test worker: for every connection a browser
// opens, the worker looks localhost up once for each address family and connects once both answer.
// A Mac's resolver now and then takes 5 s over the IPv6 address, which holds the browser's
// connection as long, and a test that waits on that request misses its 5 s. localhost is the
// loopback interface whatever a resolver says (RFC 6761, section 6.3), as browsers treat it, so it
// is answered at once. Every other name goes to the resolver as before. playwright.config.ts sets
// this up in each process that loads it, the workers among them.
import dns from "node:dns";

type Options = number | dns.LookupOptions | undefined;

// In the resolver's own order, which puts the IPv6 loopback first (RFC 6724)
const LOOPBACK: readonly dns.LookupAddress[] = [
  { address: "::1", family: 6 },
  { address: "127.0.0.1", family: 4 },
];

/** The family a lookup asks for: 4, 6, or 0 for either */
function familyOf(options: Options): number {
  const family = typeof options === "number" ? options : options?.family;
  if (family === "IPv4") return 4;
  if (family === "IPv6") return 6;
  return family ?? 0;
}

/** localhost's addresses of the family a lookup asks for, in the order it asks for */
function loopback(options: Options): dns.LookupAddress[] {
  const family = familyOf(options);
  const order = (typeof options === "object" ? options.order : undefined) ?? dns.getDefaultResultOrder();
  const ordered = order === "ipv4first" ? LOOPBACK.toReversed() : [...LOOPBACK];
  return ordered.filter((address) => family === 0 || address.family === family);
}

/** Answers dns.promises.lookup for localhost with the loopback addresses, others as before */
export function answerLocalhost(): void {
  const resolve = dns.promises.lookup;
  async function lookup(hostname: string, options?: Options) {
    const addresses = hostname.toLowerCase() === "localhost" ? loopback(options) : [];
    // A family that has no address goes to the resolver, which refuses it
    if (addresses[0] !== undefined) {
      return typeof options === "object" && options.all === true ? addresses : addresses[0];
    }
    if (options === undefined) return resolve(hostname);
    // Each form of the options has its own of the resolver's overloads
    return typeof options === "number" ? resolve(hostname, options) : resolve(hostname, options);
  }
  Object.defineProperty(dns.promises, "lookup", { value: lookup, writable: true, configurable: true });
}
