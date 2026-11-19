import { createTranslator } from "next-intl";
import type { UnitNames } from "@/lib/format/units";
import { INTL_LOCALE } from "@/lib/i18n/intl-locale";
import type { AppLocale } from "@/lib/i18n/locales";
import { CATALOGS } from "./catalogs.ts";

// The copy a page's parts render with in a unit test, as the page hands it to them: the translator
// getTranslations gives over the language's catalog (catalogs.ts), and getUnitNames's unit names.

/** The page's translator in the language, over its whole catalog */
export const translator = (locale: AppLocale) =>
  createTranslator({ locale: INTL_LOCALE[locale], messages: CATALOGS[locale] });

/** The unit names in the language (DESIGN §9.5) */
const unitNames = (locale: AppLocale): UnitNames => ({
  locale,
  unit: CATALOGS[locale].format.unit,
  spoken: CATALOGS[locale].format.spoken,
});

/** What a car page's part renders with in a language: the locale, unit names and translator */
export const pageCopy = (locale: AppLocale) => ({ locale, names: unitNames(locale), t: translator(locale) });

/** A message's words before its first value, which show wherever the message does */
export const wordsBefore = (message: string) => message.split("{")[0]?.trim() ?? message;
