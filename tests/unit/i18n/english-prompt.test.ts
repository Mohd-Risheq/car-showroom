import { describe, expect, it } from "vitest";
import { offersEnglish } from "@/lib/i18n/english-prompt";
import { LOCALE_COOKIE } from "@/lib/i18n/locale-cookie";

// FR-01.2a and BR-01: when an Arabic page offers English. TC-01-1 checks the prompt in the browser.

describe("offersEnglish", () => {
  it("offers English while no choice is stored and the browser's first language is English", () => {
    for (const first of ["en-US", "en", "en-GB", "EN-us"]) {
      expect(offersEnglish("theme=dark", [first, "ar"]), first).toBe(true);
    }
  });

  it("doesn't when English isn't the first language", () => {
    expect(offersEnglish("", ["ar-JO", "en-US"])).toBe(false);
    expect(offersEnglish("", ["fr-FR"])).toBe(false);
  });

  it("doesn't once the visitor has chosen either language", () => {
    for (const locale of ["ar", "en"]) {
      expect(offersEnglish(`${LOCALE_COOKIE}=${locale}`, ["en-US"]), locale).toBe(false);
    }
  });

  it("offers it when the stored value names no locale of the site", () => {
    expect(offersEnglish(`${LOCALE_COOKIE}=fr`, ["en-US"])).toBe(true);
  });

  it("doesn't for a browser that names no language, or a tag Intl can't read", () => {
    expect(offersEnglish("", [])).toBe(false);
    for (const tag of ["", "*", "en-"]) {
      expect(offersEnglish("", [tag]), tag).toBe(false);
    }
  });
});
