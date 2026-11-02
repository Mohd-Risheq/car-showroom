import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROUTE_TEMPLATES, routeTemplateOf } from "@/lib/analytics/routes";

// The fixed route list a client_error names its page by (API-03, NFR-OBS-02), so no slug, id or
// query reaches the server's log

const APP = "src/app";

/** Each page the app builds, by its route template, leaving out the dev pages (D-012) */
function builtPages(dir = APP): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "(dev)" ? [] : builtPages(full);
    if (entry.name !== "page.tsx") return [];
    const segments = path
      .relative(APP, dir)
      .split(path.sep)
      .filter((segment) => segment !== "" && !/^\(.+\)$/.test(segment));
    return [`/${segments.join("/")}`];
  });
}

describe("the route templates", () => {
  it("hold every page the app builds", () => {
    const pages = builtPages();
    expect(pages).toEqual(expect.arrayContaining(["/[locale]", "/[locale]/[...rest]"]));
    expect(ROUTE_TEMPLATES).toEqual(expect.arrayContaining(pages));
  });

  it("are SRS §9.2's pages, under their locale, with the 404's catch-all last", () => {
    for (const template of ROUTE_TEMPLATES) expect(template).toMatch(/^\/\[locale\](\/[a-z\-[\].]+)*$/);
    expect(ROUTE_TEMPLATES.at(-1)).toBe("/[locale]/[...rest]");
    expect(new Set(ROUTE_TEMPLATES).size).toBe(ROUTE_TEMPLATES.length);
  });
});

describe("routeTemplateOf", () => {
  it.each([
    ["/ar", "/[locale]"],
    ["/en/", "/[locale]"],
    ["/ar/cars", "/[locale]/cars"],
    ["/en/cars/2021-toyota-land-cruiser-gxr-mu-7k3p", "/[locale]/cars/[slug]"],
    ["/ar/compare", "/[locale]/compare"],
    ["/en/privacy", "/[locale]/privacy"],
    ["/en/credits", "/[locale]/credits"],
    ["/ar/demo/cars/2019-kia-morning-mu-2b8c", "/[locale]/demo/cars/[slug]"],
    ["/en/dealer", "/[locale]/dealer"],
    ["/en/dealer/cars/new", "/[locale]/dealer/cars/new"],
    ["/ar/dealer/cars/01923456-7890-7abc-8def-00000000000a/edit", "/[locale]/dealer/cars/[id]/edit"],
    ["/ar/dealer/cars/01923456-7890-7abc-8def-00000000000a/window-card", "/[locale]/dealer/cars/[id]/window-card"],
  ])("names %s by %s", (pathname, template) => {
    expect(routeTemplateOf(pathname)).toBe(template);
  });

  it.each([
    ["a page no route has", "/en/no-such-page"],
    ["a path under a page with no pages below it", "/en/cars/2021-toyota-land-cruiser-gxr-mu-7k3p/photos"],
    ["a dev page (D-012)", "/en/dev/shell/failing"],
    ["a dealer dev page", "/ar/dealer/dev/vin"],
    ["a path with no locale", "/cars"],
    ["the root", "/"],
    ["a locale the site doesn't have", "/fr/cars"],
  ])("names %s by the 404's catch-all", (_, pathname) => {
    expect(routeTemplateOf(pathname)).toBe("/[locale]/[...rest]");
  });
});
