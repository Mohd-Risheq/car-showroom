import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { INTL_LOCALE, TIME_ZONE } from "./intl-locale";
import { type AppLocale, routing } from "./routing";

// Each catalog loads on its own, typed by its JSON
const CATALOGS = {
  ar: () => import("../../../messages/ar.json"),
  en: () => import("../../../messages/en.json"),
} satisfies Record<AppLocale, () => Promise<unknown>>;

export default getRequestConfig(async ({ locale }) => {
  // An explicit locale wins: Server Actions and Route Handlers can't read root params (SRS §11.5 rule 8)
  const requested = locale ?? (await rootParams.locale());

  // An unknown locale prefix such as /fr is a 404 (FR-01 edge cases)
  if (!hasLocale(routing.locales, requested)) notFound();

  return {
    // next-intl formats a plural's number, a date or a price with this locale, so Arabic keeps
    // Western digits (D-040). The URL's locale stays ar or en: getAppLocale reads it.
    locale: INTL_LOCALE[requested],
    timeZone: TIME_ZONE,
    messages: (await CATALOGS[requested]()).default,
  };
});
