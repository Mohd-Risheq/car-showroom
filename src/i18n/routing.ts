import { defineRouting } from "next-intl/routing";
import { DEFAULT_LOCALE, LOCALES } from "./locales";

// Every page sits behind a locale prefix (C-03, FR-01.1)
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
});

export type AppLocale = (typeof routing.locales)[number];

const DIRECTION = {
  ar: "rtl",
  en: "ltr",
} as const satisfies Record<AppLocale, "rtl" | "ltr">;

export function directionOf(locale: AppLocale): "rtl" | "ltr" {
  return DIRECTION[locale];
}
