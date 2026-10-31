import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WORDMARK_STEPS, wordmarkLength } from "@/features/shell/domain/wordmark";
import { tokenBlocks } from "@/styles/token-blocks";

// DESIGN §2 and §10.3: the header's wordmark, the dealer's name, takes a smaller size step as the name
// grows, counted in code points, so the header never wraps

describe("wordmarkLength", () => {
  it("keeps a name of up to 14 characters at the base step", () => {
    expect(WORDMARK_STEPS.base).toBe(14);
    for (const name of ["Muftah", "مفتاح موتورز", "x".repeat(14)]) expect(wordmarkLength(name), name).toBe("base");
  });

  it("takes the long step up to 24 characters, and the longest past it", () => {
    expect(WORDMARK_STEPS.long).toBe(24);
    expect(wordmarkLength("x".repeat(15))).toBe("long");
    expect(wordmarkLength("x".repeat(24))).toBe("long");
    expect(wordmarkLength("x".repeat(25))).toBe("longest");
    expect(wordmarkLength("x".repeat(60))).toBe("longest");
  });

  it("counts a character outside the basic plane as one", () => {
    // Mathematical bold A, two UTF-16 units each
    expect(wordmarkLength("\u{1D400}".repeat(14))).toBe("base");
    expect(wordmarkLength("\u{1D400}".repeat(15))).toBe("long");
  });
});

describe("the wordmark's sizes in tokens.css", () => {
  it("get smaller from the base step to the longest at every width", () => {
    const { blocks, problems } = tokenBlocks(readFileSync("src/styles/tokens.css", "utf8"));
    expect(problems).toStrictEqual([]);
    const sizes = new Map<string, number>();
    const size = (name: string) => {
      const value = sizes.get(name);
      if (value === undefined) throw new Error(`${name} isn't set`);
      return value;
    };
    for (const block of [
      ":root",
      "@media (width >= 22.5rem) :root",
      "@media (width >= 48rem) :root",
      "@media (width >= 64rem) :root",
    ]) {
      for (const [name, value] of blocks.get(block) ?? []) {
        if (!name.startsWith("--wordmark-size")) continue;
        expect(value, `${block} ${name}`).toMatch(/^\d+(?:\.\d+)?rem$/);
        sizes.set(name, Number.parseFloat(value));
      }
      expect(size("--wordmark-size"), block).toBeGreaterThan(size("--wordmark-size-long"));
      expect(size("--wordmark-size-long"), block).toBeGreaterThan(size("--wordmark-size-longest"));
    }
  });
});
