import { type AppLocale, isAppLocale } from "./locales";

// A first segment shaped like a language tag, two letters with any subtags (fr, de-AT, zh-Hant-TW,
// en_GB), is a locale prefix. No route of the site has a two-letter first segment (SRS §11.3), so the
// rule hides none: /cars, /c/{ref} and /dealer stay unprefixed paths.
const LANGUAGE_TAG = /^[a-z]{2}(?:[-_][a-z0-9]{1,8})*$/i;

/**
 * What a path's first segment says about its locale: one of the site's, with the path after it;
 * another site's, which is a 404 (FR-01's edge cases); or none, which is redirected (FR-01.2)
 */
export type LocalePrefix = { kind: "site"; locale: AppLocale; rest: string } | { kind: "other" } | { kind: "none" };

export function localePrefixOf(pathname: string): LocalePrefix {
  const segment = pathname.split("/", 2)[1] ?? "";
  if (isAppLocale(segment)) return { kind: "site", locale: segment, rest: pathname.slice(segment.length + 1) };
  return LANGUAGE_TAG.test(segment) ? { kind: "other" } : { kind: "none" };
}

/**
 * A path under one of the site's locales, with a query as URLSearchParams writes it, without "?":
 * the same page in the other locale (FR-01.4), a path with no prefix (FR-01.2), or one with another
 * site's prefix, which proxy.ts rewrites under /ar, where it is a 404 (FR-01's edge cases)
 */
export function pathInLocale(pathname: string, query: string, locale: AppLocale): string {
  const prefix = localePrefixOf(pathname);
  const rest = prefix.kind === "site" ? prefix.rest : pathname;
  return `/${locale}${rest === "/" ? "" : rest}${query ? `?${query}` : ""}`;
}
