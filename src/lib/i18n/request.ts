import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";
import { hasLocale, type IntlError, IntlErrorCode } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { log } from "@/lib/log/logger";
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

  // A locale the site doesn't have, passed explicitly or as the first segment of a path the proxy
  // skips, a file's such as /fr/x.png or one under /api, is Next.js's plain 404. Any other path
  // under another locale's prefix, with a dot or without, proxy.ts rewrites under /ar, which gives
  // the localized 404 (D-041, D-047).
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
  log(error.code === IntlErrorCode.MISSING_MESSAGE ? "warn" : "error", error.code, { message: error.message });
}
