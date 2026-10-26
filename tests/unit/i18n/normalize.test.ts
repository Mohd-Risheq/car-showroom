import { describe, expect, it } from "vitest";
import { normalizeDigits, normalizeSearch } from "@/lib/i18n/normalize";

// FR-08.3 (TC-08-2) with the owner's additions of 24 Oct 2026, and FR-31.5 (TC-31-4)

const char = (codePoint: number) => String.fromCodePoint(codePoint);

describe("normalizeSearch", () => {
  it("unifies the alef forms, ة and ى, and removes diacritics (TC-08-2)", () => {
    expect(normalizeSearch("أحمد")).toBe("احمد");
    expect(normalizeSearch("إسلام")).toBe("اسلام");
    expect(normalizeSearch("آية")).toBe("ايه");
    expect(normalizeSearch("ٱلقدس")).toBe("القدس");
    expect(normalizeSearch("سيارةٌ")).toBe("سياره");
    expect(normalizeSearch("مصطفى")).toBe("مصطفي");
    expect(normalizeSearch("كَامْرِي")).toBe("كامري");
    expect(normalizeSearch("كامرى")).toBe(normalizeSearch("كامري"));
  });

  it("folds the hamza seats, tatweel and the Persian yeh and keheh (TC-08-2)", () => {
    expect(normalizeSearch("مؤمن")).toBe("مومن");
    expect(normalizeSearch("رئيس")).toBe("رييس");
    expect(normalizeSearch("كـــامري")).toBe("كامري");
    expect(normalizeSearch(`${char(0x06a9)}امر${char(0x06cc)}`)).toBe("كامري");
  });

  it("reads hamza typed as a separate mark like the composed letter", () => {
    expect(normalizeSearch(`${char(0x0627)}${char(0x0654)}حمد`)).toBe("احمد");
    expect(normalizeSearch(`${char(0x0648)}${char(0x0654)}`)).toBe("و");
  });

  it("reads presentation forms and full-width Latin as the plain letters", () => {
    expect(normalizeSearch(char(0xfefb))).toBe("لا");
    expect(normalizeSearch(char(0xfe83))).toBe("ا");
    expect(normalizeSearch("ＣＡＭＲＹ")).toBe("camry");
  });

  it("lowercases Latin, maps the digits and collapses spaces", () => {
    expect(normalizeSearch("  Camry   2019 ")).toBe("camry 2019");
    expect(normalizeSearch("كامري ٢٠١٩")).toBe("كامري 2019");
    expect(normalizeSearch("MU-24Q7")).toBe("mu-24q7");
  });

  it("drops the invisible marks pasted text carries", () => {
    expect(normalizeSearch(`${char(0x200f)}كامري${char(0x200c)}`)).toBe("كامري");
    expect(normalizeSearch(`camry${char(0x00a0)}2019`)).toBe("camry 2019");
  });

  it("returns the same text when it is already folded", () => {
    for (const text of ["احمد", "camry 2019", "تويوتا كامري"]) {
      expect(normalizeSearch(normalizeSearch(text))).toBe(normalizeSearch(text));
    }
  });
});

describe("normalizeDigits", () => {
  it("writes Arabic-Indic and Persian digits as Western ones (TC-31-4)", () => {
    expect(normalizeDigits("١٤٥٠٠")).toBe("14500");
    expect(normalizeDigits("۱۴۵۰۰")).toBe("14500");
    expect(normalizeDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(normalizeDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
  });

  it("writes the Arabic decimal and thousands separators as Western ones", () => {
    expect(normalizeDigits("٧٫٥")).toBe("7.5");
    expect(normalizeDigits("١٤٬٥٠٠")).toBe("14,500");
  });

  it("leaves letters and Western digits as they are", () => {
    expect(normalizeDigits("كامري 2019")).toBe("كامري 2019");
  });
});
