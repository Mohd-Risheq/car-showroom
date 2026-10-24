import { defineRouting } from "next-intl/routing";
import { DEFAULT_LOCALE, LOCALES } from "./locales";

// Every page sits behind a locale prefix (C-03, FR-01.1). The locales themselves, their directions
// and the switch between them are in locales.ts.
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
});
