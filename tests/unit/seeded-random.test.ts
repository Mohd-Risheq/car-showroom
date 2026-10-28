import { describe, expect, it } from "vitest";
import { fnv1a32, keyedRandom, seededRandom } from "@/lib/seeded-random";

// The generator the fixture scripts, the reel spike's test pattern and the tests draw from. The
// fixtures regenerate byte for byte only while a seed draws the same numbers everywhere.

const firstThree = (seed: number) => {
  const next = seededRandom(seed);
  return [next(), next(), next()];
};

describe("seededRandom", () => {
  it("draws mulberry32's numbers, the same from a seed every time", () => {
    // Drawn by the reference mulberry32 from seed 1
    expect(firstThree(1)).toStrictEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
    expect(firstThree(1)).toStrictEqual(firstThree(1));
  });

  it("draws other numbers from another seed, and takes a seed's low 32 bits", () => {
    expect(firstThree(2)).not.toStrictEqual(firstThree(1));
    expect(firstThree(2 ** 32 + 1)).toStrictEqual(firstThree(1));
  });

  it("draws from 0 up to, but not including, 1", () => {
    const next = seededRandom(99);
    const draws = Array.from({ length: 10_000 }, () => next());
    expect(Math.min(...draws)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...draws)).toBeLessThan(1);
  });
});

describe("fnv1a32", () => {
  it("gives the FNV-1a reference values", () => {
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("a")).toBe(0xe40c292c);
    expect(fnv1a32("foobar")).toBe(0xbf9cf968);
  });

  it("hashes the text's UTF-8 bytes, not its UTF-16 code units", () => {
    // Worked out by a separate FNV-1a over the UTF-8 bytes: é is C3 A9, and مفتاح is ten bytes
    expect(fnv1a32("é")).toBe(0x1e9de8c1);
    expect(fnv1a32("مفتاح")).toBe(0xec04d765);
    // The one byte E9, which a hash of the code unit would take for é
    expect(fnv1a32("é")).not.toBe(0x6c0b6c44);
  });

  it("is an unsigned 32-bit number", () => {
    for (const text of ["s01|car_view|2026-10-18|ar", "site", "x".repeat(1000)]) {
      const hash = fnv1a32(text);
      expect(Number.isInteger(hash)).toBe(true);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThan(2 ** 32);
    }
  });
});

describe("keyedRandom", () => {
  it("draws mulberry32's numbers from the key's hash, the same every time", () => {
    const draws = (next: () => number) => [next(), next(), next()];
    expect(draws(keyedRandom("s01|time_of_day"))).toStrictEqual(draws(seededRandom(fnv1a32("s01|time_of_day"))));
    expect(draws(keyedRandom("s01"))).toStrictEqual(draws(keyedRandom("s01")));
    expect(draws(keyedRandom("s01"))).not.toStrictEqual(draws(keyedRandom("s02")));
  });
});
