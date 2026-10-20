// Seeded randomness for tests that try many inputs: one seed draws the same inputs on every run.
// mulberry32, the generator the fixture scripts use.
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
