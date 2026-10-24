import "server-only";
import { getLocale, getMessages } from "next-intl/server";
import type { UnitNames } from "@/lib/format/units";
import { appLocaleOf } from "./intl-locale";
import type { AppLocale } from "./locales";

/** The page's locale as its URL names it, ar or en, for <html lang>, the direction and links (D-040) */
export async function getAppLocale(): Promise<AppLocale> {
  return appLocaleOf(await getLocale());
}

/**
 * The page's locale and the catalog's unit names, for Quantity. Taken from the catalog as written:
 * a unit holds no ICU syntax, which tests/unit/format/units.test.ts checks, so it shows as written.
 */
export async function getUnitNames(): Promise<UnitNames> {
  const [locale, messages] = await Promise.all([getAppLocale(), getMessages()]);
  return { locale, unit: messages.format.unit, spoken: messages.format.spoken };
}
