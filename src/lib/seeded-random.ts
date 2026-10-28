// mulberry32, a small seeded generator: one seed draws the same numbers on every machine. The
// fixture scripts, the reel spike's test pattern, the seed's sample analytics and the tests share
// it. Node loads this module from scripts/, so it has no imports.
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const utf8 = new TextEncoder();

/** The 32-bit FNV-1a hash of the text's UTF-8 bytes, as an unsigned number */
export function fnv1a32(text: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (const byte of utf8.encode(text)) hash = Math.imul(hash ^ byte, FNV_PRIME) >>> 0;
  return hash;
}

/**
 * The generator for a text key: mulberry32 seeded with the key's FNV-1a hash (05-SEED-DATA §8.2),
 * so each key draws its own numbers, the same ones on every server
 */
export function keyedRandom(key: string): () => number {
  return seededRandom(fnv1a32(key));
}
