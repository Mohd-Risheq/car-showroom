import { describe, expect, it } from "vitest";
import { textIn } from "@/lib/i18n/bilingual";

// BR-28: a dealer's text shows in the page's language, or in the other one, marked with its own
// language, when the page's is missing

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
});
