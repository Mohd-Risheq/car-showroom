import { isAppLocale } from "../i18n/locales.ts";

// API-03's fixed route list: a client_error names its page by one of these (NFR-OBS-02), so no
// slug, id or query reaches the server's log. SRS §9.2's pages, those not built yet included;
// /c/[ref] only redirects, so no page of its own can fail. Any other path, a dev page (D-012)
// among them, is the 404's catch-all, which comes last. Pure: the browser and the ingest share it.

export const ROUTE_TEMPLATES = [
  "/[locale]",
  "/[locale]/cars",
  "/[locale]/cars/[slug]",
  "/[locale]/compare",
  "/[locale]/garage",
  "/[locale]/visit",
  "/[locale]/how-its-built",
  "/[locale]/privacy",
  "/[locale]/credits",
  "/[locale]/demo",
  "/[locale]/demo/cars/[slug]",
  "/[locale]/dealer",
  "/[locale]/dealer/sign-in",
  "/[locale]/dealer/account",
  "/[locale]/dealer/cars/new",
  "/[locale]/dealer/cars/[id]/edit",
  "/[locale]/dealer/cars/[id]/share",
  "/[locale]/dealer/cars/[id]/window-card",
  "/[locale]/dealer/cars/[id]/reel",
  "/[locale]/dealer/settings",
  "/[locale]/dealer/staff",
  "/[locale]/[...rest]",
] as const;

export type RouteTemplate = (typeof ROUTE_TEMPLATES)[number];

const CATCH_ALL = "/[locale]/[...rest]";

/** Whether a page's path segments fit a template's: [name] takes any one segment */
function fits(template: string, segments: readonly string[]): boolean {
  const parts = template.split("/").slice(2);
  return parts.length === segments.length && parts.every((part, i) => part.startsWith("[") || part === segments[i]);
}

/** The template a pathname's page has, or the catch-all's */
export function routeTemplateOf(pathname: string): RouteTemplate {
  const [locale, ...segments] = pathname.split("/").filter(Boolean);
  if (!isAppLocale(locale)) return CATCH_ALL;
  return ROUTE_TEMPLATES.find((template) => template !== CATCH_ALL && fits(template, segments)) ?? CATCH_ALL;
}
