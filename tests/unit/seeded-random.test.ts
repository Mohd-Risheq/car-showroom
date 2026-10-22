import { describe, expect, it } from "vitest";
import { seededRandom } from "@/lib/seeded-random";

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
