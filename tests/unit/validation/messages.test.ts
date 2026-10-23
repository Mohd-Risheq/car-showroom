import { existsSync, readFileSync } from "node:fs";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { INTL_LOCALE } from "@/lib/i18n/intl-locale";
import { LOCALES } from "@/lib/i18n/locales";
import { ANY_FIELD_MESSAGES, RULE_MESSAGES } from "@/lib/validation/messages";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import { type Locale, readCatalog } from "../../../scripts/checks/i18n.ts";

// The message keys of each validation rule (SRS §7.1), against the catalogs and the specification

const SRS = new URL("../../../docs/02-SRS.md", import.meta.url);
const NBSP = String.fromCodePoint(0xa0);

/** A catalog's keys */
function keys(locale: Locale): Set<string> {
  return new Set(readCatalog(`messages/${locale}.json`, locale, { en, ar }[locale]).catalog.messages.keys());
}

const named = new Set<string>([...ANY_FIELD_MESSAGES, ...Object.values(RULE_MESSAGES).flat()]);

describe("the validation messages", () => {
  it("name keys both catalogs have", () => {
    for (const locale of LOCALES) {
      const catalog = keys(locale);
      expect(
        [...named].filter((key) => !catalog.has(key)),
        locale,
      ).toStrictEqual([]);
    }
  });

  it("group the numbers they print, in both languages (BR-02)", () => {
    const t = (locale: Locale) => createTranslator({ locale: INTL_LOCALE[locale], messages: { en, ar }[locale] });
    expect(t("en")("validation.range", { min: 1000, max: 10000 })).toBe("Enter a value between 1,000 and 10,000");
    expect(t("ar")("validation.range", { min: 1000, max: 10000 })).toBe("يُرجى إدخال قيمة بين 1,000 و10,000");
    expect(t("en")("validation.fileSize", { max: 1000 })).toBe(`This file is larger than 1,000${NBSP}MB`);
    expect(t("ar")("validation.fileSize", { max: 1000 })).toBe(`حجم هذا الملف أكبر من 1,000${NBSP}ميغابايت`);
  });

  it("use every message of the catalogs' validation group", () => {
    const group = [...keys("en")].filter((key) => key.startsWith("validation."));
    expect(group.filter((key) => !named.has(key))).toStrictEqual([]);
  });

  // The specification is private, so only the private repository can compare (D-035)
  it.skipIf(!existsSync(SRS))("are the keys SRS §7.1 gives each rule, and those of any field", () => {
    const srs = readFileSync(SRS, "utf8");
    const section = srs.slice(srs.indexOf("### 7.1 "), srs.indexOf("### 7.2 "));
    const keysIn = (text: string) => [...text.matchAll(/`(validation\.[A-Za-z0-9]+)`/g)].map((match) => match[1]);
    const rules = Object.fromEntries(
      [...section.matchAll(/^\| (VR-\d+) \|[^|\n]*\|[^|\n]*\|([^\n]*)\|\s*$/gm)].map((row) => [
        row[1],
        keysIn(row[2] ?? ""),
      ]),
    );
    expect(rules).toStrictEqual(RULE_MESSAGES);
    expect(keysIn(section.slice(0, section.indexOf("| ID |")))).toStrictEqual([...ANY_FIELD_MESSAGES]);
  });
});
