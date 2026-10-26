import "server-only";
import { createHmac } from "node:crypto";
import { isIPv4, isIPv6 } from "node:net";

// SEC-12's keys: HMAC-SHA256(K_month, scope|route|subject), with K_month =
// HMAC-SHA256(RATE_LIMIT_HMAC_SECRET, "YYYY-MM") for the month in UTC, so ENT-RateLimit holds no IP
// or email and keys rotate monthly without a redeploy. The scope says what the subject is, so one
// route can count by two (API-16 by user and by demo session); the route is its §8.3 id, such as
// API-10; the subject is a network, an email, a user id or a sandbox id.

export type RateLimitScope = "network" | "email" | "user" | "sandbox";
export type RateLimitParts = { readonly scope: RateLimitScope; readonly route: string; readonly subject: string };

const SECRET_MIN_LENGTH = 32;

/** RATE_LIMIT_HMAC_SECRET, read when a key is made, so a build or a test that makes none needs no secret */
export function rateLimitSecret(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const secret = env.RATE_LIMIT_HMAC_SECRET;
  if (!secret) throw new Error("RATE_LIMIT_HMAC_SECRET is not set (SRS §15.1, SEC-12)");
  if (secret.length < SECRET_MIN_LENGTH) {
    throw new Error(`RATE_LIMIT_HMAC_SECRET is shorter than ${SECRET_MIN_LENGTH} characters (SEC-12)`);
  }
  return secret;
}

/** The key, in base64url (43 characters). The route can't hold "|", so the parts can't run together. */
export function rateLimitKey(secret: string, { scope, route, subject }: RateLimitParts, now: Date): string {
  if (route === "" || route.includes("|")) throw new RangeError(`Not a route for a rate-limit key: ${route}`);
  if (subject === "") throw new RangeError("A rate-limit key needs a subject");
  const monthKey = createHmac("sha256", secret).update(now.toISOString().slice(0, 7)).digest();
  return createHmac("sha256", monthKey).update(`${scope}|${route}|${subject}`).digest("base64url");
}

/**
 * SEC-12's network: an IPv4 address, or the /64 prefix of an IPv6 address written out in full
 * (2001:0db8:0001:0002::/64), an IPv4-mapped address being its IPv4 one. Null for anything that
 * isn't an address: a caller counts those in one shared bucket, never skips the limit.
 */
export function networkSubject(ip: string): string | null {
  if (isIPv4(ip)) return ip;
  if (!isIPv6(ip)) return null;
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0] = ipv6Groups(ip.split("%")[0] ?? "");
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0xffff) {
    return [g >> 8, g & 0xff, h >> 8, h & 0xff].join(".");
  }
  return `${[a, b, c, d].map((group) => group.toString(16).padStart(4, "0")).join(":")}::/64`;
}

/** The eight 16-bit groups of an address isIPv6 accepted, with :: expanded */
function ipv6Groups(address: string): number[] {
  const [head = "", tail] = address.split("::");
  const front = groupsOf(head);
  const back = tail === undefined ? [] : groupsOf(tail);
  return [...front, ...new Array<number>(8 - front.length - back.length).fill(0), ...back];
}

function groupsOf(part: string): number[] {
  if (part === "") return [];
  return part.split(":").flatMap((group) => {
    if (!group.includes(".")) return [Number.parseInt(group, 16)];
    const [a = 0, b = 0, c = 0, d = 0] = group.split(".").map(Number);
    return [(a << 8) | b, (c << 8) | d];
  });
}
