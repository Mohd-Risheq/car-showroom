import { assertLimit, type RateLimit, type RateLimitResult, rateLimitResult } from "./limit";

// SRS §8.3's in-memory windows, one instance's own: API-30 and API-34 count only here, and API-03
// here before the database. A limiter serves one limit, so its windows all last as long and the
// map, in insertion order, is also in the order they end while callers' times go forward: ended
// windows leave from the front, and at maxKeys the oldest goes, each in constant time, however many
// addresses send calls. Times come from the caller and may arrive out of order, so a key's window
// found already ended starts again, wherever it sits. Keys are key.ts's HMAC keys, so no raw IP is
// kept even here.

type Window = { readonly start: number; count: number };

export class MemoryLimiter {
  readonly #limit: RateLimit;
  readonly #maxKeys: number;
  readonly #windows = new Map<string, Window>();

  constructor(limit: RateLimit, maxKeys = 10_000) {
    assertLimit(limit);
    if (!Number.isInteger(maxKeys) || maxKeys < 1) {
      throw new RangeError(`A limiter keeps at least one key, not ${maxKeys}`);
    }
    this.#limit = limit;
    this.#maxKeys = maxKeys;
  }

  /** The keys whose windows it holds */
  get size(): number {
    return this.#windows.size;
  }

  consume(key: string, now: Date): RateLimitResult {
    this.#forgetEnded(now.getTime());
    let window = this.#windows.get(key);
    if (window !== undefined && this.#hasEnded(window, now.getTime())) {
      this.#windows.delete(key);
      window = undefined;
    }
    if (window === undefined) {
      if (this.#windows.size >= this.#maxKeys) this.#forgetOldest();
      window = { start: now.getTime(), count: 0 };
      this.#windows.set(key, window);
    }
    window.count += 1;
    return rateLimitResult(
      { count: window.count, windowStart: new Date(window.start), blockedUntil: null },
      this.#limit,
      now,
    );
  }

  #hasEnded(window: Window, time: number): boolean {
    return window.start + this.#limit.windowSeconds * 1000 <= time;
  }

  #forgetEnded(time: number): void {
    for (const [key, window] of this.#windows) {
      if (!this.#hasEnded(window, time)) return;
      this.#windows.delete(key);
    }
  }

  #forgetOldest(): void {
    const oldest = this.#windows.keys().next();
    if (!oldest.done) this.#windows.delete(oldest.value);
  }
}
