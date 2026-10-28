import { vi } from "vitest";

// Randomness for tests. Tests that try many inputs draw them from a seeded generator
// (src/lib/seeded-random.ts), so one seed draws the same inputs on every run, and tests of a
// random draw plant the bytes it reads.

/** A random source that hands out the given bytes in order, and nothing once they run out */
export function scripted(...bytes: number[]) {
  const queue = [...bytes];
  return (count: number) => Uint8Array.from(queue.splice(0, count));
}

/**
 * The platform's cryptographic source, planted: crypto.getRandomValues fills each array it is given
 * from the bytes, in order, as `scripted` hands them out. The spy stays until the mocks are restored.
 */
export function plantCryptoBytes(...bytes: number[]) {
  const next = scripted(...bytes);
  return vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((array) => {
    if (array instanceof Uint8Array) array.set(next(array.length));
    return array;
  });
}

/** A whole number from 0 up to, but not including, `below` */
export function randomBelow(random: () => number, below: number): number {
  return Math.floor(random() * below);
}

/** One of `items`, chosen by `random` */
export function pick<T>(random: () => number, items: readonly T[]): T {
  const item = items[randomBelow(random, items.length)];
  if (item === undefined) throw new Error("pick needs at least one item");
  return item;
}
