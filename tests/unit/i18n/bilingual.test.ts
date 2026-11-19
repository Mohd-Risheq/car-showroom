import { describe, expect, it } from "vitest";
import { hasText, textIn } from "@/lib/i18n/bilingual";

// BR-28: a dealer's text shows in the page's language, or in the other one, marked with its own
// language, when the page's is missing or blank

describe("textIn", () => {
  it("is the text in the page's language", () => {
    const text = { ar: "مرحبا", en: "Hello" };
    expect(textIn(text, "ar")).toStrictEqual({ text: "مرحبا", lang: "ar" });
    expect(textIn(text, "en")).toStrictEqual({ text: "Hello", lang: "en" });
  });

  it("falls back to the other language, marked as such", () => {
    expect(textIn({ ar: null, en: "Hello" }, "ar")).toStrictEqual({ text: "Hello", lang: "en" });
    expect(textIn({ ar: "مرحبا", en: null }, "en")).toStrictEqual({ text: "مرحبا", lang: "ar" });
  });

  it("is null when the dealer wrote it in neither", () => {
    expect(textIn({ ar: null, en: null }, "ar")).toBeNull();
    expect(textIn({ ar: null, en: null }, "en")).toBeNull();
  });

  it("takes blank text as unwritten, so the other language's shows in its place", () => {
    expect(textIn({ ar: "  ", en: "Hello" }, "ar")).toStrictEqual({ text: "Hello", lang: "en" });
    expect(textIn({ ar: "مرحبا", en: "\n" }, "en")).toStrictEqual({ text: "مرحبا", lang: "ar" });
    expect(textIn({ ar: " ", en: "" }, "en")).toBeNull();
  });
});

describe("hasText", () => {
  it("says whether the dealer wrote the text in either language, whatever the page's", () => {
    expect(hasText({ ar: "مرحبا", en: "Hello" })).toBe(true);
    expect(hasText({ ar: "مرحبا", en: null })).toBe(true);
    expect(hasText({ ar: null, en: "Hello" })).toBe(true);
    expect(hasText({ ar: null, en: null })).toBe(false);
  });

  it("takes blank text as unwritten", () => {
    expect(hasText({ ar: "  ", en: "" })).toBe(false);
    expect(hasText({ ar: " ", en: "Hello" })).toBe(true);
  });
});
