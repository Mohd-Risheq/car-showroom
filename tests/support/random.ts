// Draws for tests that try many inputs, from a seeded generator (src/lib/seeded-random.ts),
// so one seed draws the same inputs on every run

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
