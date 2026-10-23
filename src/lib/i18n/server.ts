import "server-only";
import { getLocale } from "next-intl/server";
import { appLocaleOf } from "./intl-locale";
import type { AppLocale } from "./routing";

/** The page's locale as its URL names it, ar or en, for <html lang>, the direction and links (D-040) */
export async function getAppLocale(): Promise<AppLocale> {
  return appLocaleOf(await getLocale());
}
