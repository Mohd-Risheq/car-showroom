// A rate limit and its verdict, shared by the database's buckets (ENT-RateLimit) and the in-memory
// ones (SRS §8.3): a call is allowed while its window's count is within the limit and no BR-42 lock
// holds. Times come from the caller, so the tests run on a fixed clock.

export type RateLimit = { readonly max: number; readonly windowSeconds: number };
export type RateLimitResult = { readonly allowed: true } | { readonly allowed: false; readonly retryAfter: number };
/** A key's count in its window, after the call being judged */
export type Bucket = { readonly count: number; readonly windowStart: Date; readonly blockedUntil: Date | null };

/** The longest window §8.3 sets (5 an hour). A row this old is past every window, so a purge may delete it. */
export const LONGEST_WINDOW_SECONDS = 3600;

export function assertLimit({ max, windowSeconds }: RateLimit): void {
  if (!Number.isInteger(max) || max < 1) throw new RangeError(`A limit allows at least one call, not ${max}`);
  if (!Number.isInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > LONGEST_WINDOW_SECONDS) {
    throw new RangeError(`A window lasts 1 to ${LONGEST_WINDOW_SECONDS} s, not ${windowSeconds}`);
  }
}

/** Allowed, or the whole seconds until both the window and any lock have ended (Retry-After) */
export function rateLimitResult(bucket: Bucket, limit: RateLimit, now: Date): RateLimitResult {
  const waits: number[] = [];
  if (bucket.count > limit.max) waits.push(bucket.windowStart.getTime() + limit.windowSeconds * 1000);
  if (bucket.blockedUntil !== null && bucket.blockedUntil > now) waits.push(bucket.blockedUntil.getTime());
  if (waits.length === 0) return { allowed: true };
  return { allowed: false, retryAfter: Math.max(1, Math.ceil((Math.max(...waits) - now.getTime()) / 1000)) };
}
