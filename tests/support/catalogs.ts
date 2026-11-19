import { IntlMessageFormat } from "intl-messageformat";
import ar from "../../messages/ar.json" with { type: "json" };
import en from "../../messages/en.json" with { type: "json" };
import { INTL_LOCALE } from "../../src/lib/i18n/intl-locale.ts";
import type { AppLocale } from "../../src/lib/i18n/locales.ts";

// The site's words in each language, as messages/ holds them, and a message formatted with its
// values as the page formats it: the journeys find a page's parts by them and read what it says, and
// the unit tests render with them (page-copy.ts). Imported as JSON, which Playwright's loader takes
// only with its type said, so each key keeps its type, and a key renamed in the catalogs fails the
// typecheck rather than a run.

/** Each language's catalog */
export const CATALOGS = { ar, en };

/** A message with its values in place, as the page formats it in the language (ICU) */
export const formatted = (locale: AppLocale, message: string, values: Record<string, string | number>) =>
  String(new IntlMessageFormat(message, INTL_LOCALE[locale]).format(values));
