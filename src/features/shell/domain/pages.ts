import type { AppLocale } from "@/lib/i18n/locales";

// The public pages the shell links to (SRS §9.2), each under its locale. The header and footer link
// to all of them from T-19 on, and a page its task hasn't built yet answers the localized 404 until
// then (the owner, 2026-10-30).

const PAGES = {
  home: "",
  cars: "/cars",
  compare: "/compare",
  visit: "/visit",
  garage: "/garage",
  howBuilt: "/how-its-built",
  privacy: "/privacy",
  credits: "/credits",
  demo: "/demo",
} as const;

export type SitePage = keyof typeof PAGES;

/** Any of the pages' paths, for a component that takes one as a prop */
export type SitePath = `/${AppLocale}${(typeof PAGES)[SitePage]}`;

/**
 * A page's path in a locale: /ar, /en/cars. Typed as the literal path, which next/link's typed routes
 * match against the routes that exist: a page not built yet matches the catch-all.
 */
export function pagePath<L extends AppLocale, P extends SitePage>(locale: L, page: P): `/${L}${(typeof PAGES)[P]}` {
  return `/${locale}${PAGES[page]}`;
}
