import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FEATURE_KEYS } from "@/lib/db/feature-keys";
import { FEATURE_LABELS } from "@/lib/db/feature-labels";
import { dashesIn } from "../../../scripts/checks/dashes.ts";

// The feature catalog's labels (SRS §6.4, D-045): reference data in both languages

const SRS = new URL("../../../docs/02-SRS.md", import.meta.url);
const ARABIC_LETTER = /\p{Script=Arabic}/u;
// The two product names the SRS gives in one form for both languages
const PRODUCT_NAMES = new Set(["carplay", "android_auto"]);

describe("the feature labels", () => {
  it("label every feature key, and nothing else, in both languages", () => {
    expect(Object.keys(FEATURE_LABELS).sort()).toStrictEqual([...FEATURE_KEYS].sort());
    for (const { en, ar } of Object.values(FEATURE_LABELS)) {
      expect(en.trim()).not.toBe("");
      expect(ar.trim()).not.toBe("");
    }
  });

  it("are written in Arabic for Arabic, except the two product names", () => {
    const notArabic = Object.entries(FEATURE_LABELS).filter(([, { ar }]) => !ARABIC_LETTER.test(ar));
    expect(notArabic.map(([key]) => key).sort()).toStrictEqual([...PRODUCT_NAMES].sort());
    for (const key of PRODUCT_NAMES) {
      const { en, ar } = FEATURE_LABELS[key as keyof typeof FEATURE_LABELS];
      expect(ar).toBe(en);
    }
  });

  it("hold no long dash and no exclamation mark (C-07)", () => {
    const texts = Object.values(FEATURE_LABELS).flatMap(({ en, ar }) => [en, ar]);
    expect(texts.flatMap(dashesIn)).toStrictEqual([]);
    expect(texts.filter((text) => text.includes("!"))).toStrictEqual([]);
  });

  // The specification is private, so only the private repository can compare (D-035). It is read
  // inside the test, so a clone without docs/ collects the file and skips the comparison.
  it.skipIf(!existsSync(SRS))("are SRS §6.4's labels", () => {
    const srs = readFileSync(SRS, "utf8");
    const catalog = srs.slice(srs.indexOf("- **Feature catalog**"), srs.indexOf("- **Seed cars:**"));
    // Each entry is `key` (English / Arabic), or `key` (Name) for a name both languages share. An
    // English label may hold " / " itself, so the Arabic starts at the first part with an Arabic letter.
    const labels = Object.fromEntries(
      Array.from(catalog.matchAll(/`([a-z0-9_]+)` \(([^)]+)\)/g), ([, key = "", text = ""]) => {
        const parts = text.split(" / ");
        const firstArabic = parts.findIndex((part) => ARABIC_LETTER.test(part));
        if (firstArabic === -1) return [key, { en: text, ar: text }];
        return [key, { en: parts.slice(0, firstArabic).join(" / "), ar: parts.slice(firstArabic).join(" / ") }];
      }),
    );
    expect(Object.keys(labels)).toHaveLength(FEATURE_KEYS.length);
    expect(FEATURE_LABELS).toStrictEqual(labels);
  });
});
