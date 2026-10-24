// Arabic first (RTL), English second (LTR) (C-03, FR-01.1). Import-free, so next.config.ts reads
// it, and so does code that runs in the browser: importing next-intl there, even its routing,
// brings more of it along than the site needs (D-041).
export const LOCALES = ["ar", "en"] as const;
export const DEFAULT_LOCALE = "ar";

export type AppLocale = (typeof LOCALES)[number];

/** Whether a value is exactly one of the site's locales, as next-intl's hasLocale checks */
export function isAppLocale(value: unknown): value is AppLocale {
  return LOCALES.some((locale) => locale === value);
}

const DIRECTION = {
  ar: "rtl",
  en: "ltr",
} as const satisfies Record<AppLocale, "rtl" | "ltr">;

/** The direction a language reads in (FR-01.3) */
export function directionOf(locale: AppLocale): "rtl" | "ltr" {
  return DIRECTION[locale];
}

const OTHER = {
  ar: "en",
  en: "ar",
} as const satisfies Record<AppLocale, AppLocale>;

/** The language a page's switch opens (FR-01.4) */
export function otherLocale(locale: AppLocale): AppLocale {
  return OTHER[locale];
}
