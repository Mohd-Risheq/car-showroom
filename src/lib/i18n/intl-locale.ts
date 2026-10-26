import { isAppLocale } from "./locales.ts";
import type { AppLocale } from "./locales.ts";

// The locale each language formats with (BR-02, BR-03), which next-intl takes as its own (D-040).
// Arabic keeps Western digits and takes Levantine month names ("18 تشرين الأول 2026"). A bare "ar"
// would give Arabic-Indic digits on iOS before 18, and "ar-JO" gives them everywhere.
export const INTL_LOCALE = {
  ar: "ar-JO-u-nu-latn",
  en: "en-GB",
} as const satisfies Record<AppLocale, string>;

// Dates and times are Jordan's (BR-03)
export const TIME_ZONE = "Asia/Amman";

/** The URL's locale for a formatting locale: ar for ar-JO-u-nu-latn, en for en-GB */
export function appLocaleOf(locale: string): AppLocale {
  const { language } = new Intl.Locale(locale);
  if (!isAppLocale(language)) throw new Error(`No locale of the site formats as ${locale}`);
  return language;
}
