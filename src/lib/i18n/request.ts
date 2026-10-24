import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";
import { hasLocale, type IntlError, IntlErrorCode } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { INTL_LOCALE, TIME_ZONE } from "./intl-locale";
import type { AppLocale } from "./locales";
import { routing } from "./routing";

// Each catalog loads on its own, typed by its JSON
const CATALOGS = {
  ar: () => import("../../../messages/ar.json"),
  en: () => import("../../../messages/en.json"),
} satisfies Record<AppLocale, () => Promise<unknown>>;

export default getRequestConfig(async ({ locale }) => {
  // An explicit locale wins: Server Actions and Route Handlers can't read root params (SRS §11.5 rule 8)
  const requested = locale ?? (await rootParams.locale());

  // A locale the site doesn't have, passed explicitly or from a path the proxy skips, such as
  // /wp-login.php, is a 404. Another locale's prefix, such as /fr/cars, gets here only on a path with
  // a dot, which the proxy skips. Otherwise proxy.ts rewrites it under /ar (D-041).
  if (!hasLocale(routing.locales, requested)) notFound();

  return {
    // next-intl formats a plural's number, a date or a price with this locale, so Arabic keeps
    // Western digits (D-040). The URL's locale stays ar or en: getAppLocale reads it.
    locale: INTL_LOCALE[requested],
    timeZone: TIME_ZONE,
    messages: (await CATALOGS[requested]()).default,
    onError: logIntlError,
  };
});

/**
 * A message missing from a catalog is a warning, and its key shows in its place (FR-01 error
 * states). check:i18n fails CI on it first (FR-01.9). Any other error stays an error.
 */
function logIntlError(error: IntlError) {
  if (error.code === IntlErrorCode.MISSING_MESSAGE) console.warn(error.message);
  else console.error(error);
}
