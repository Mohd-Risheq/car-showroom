import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CarGoneIntro } from "@/features/car-page/ui/car-gone";
import en from "../../../messages/en.json";
import { CATALOGS } from "../../support/catalogs";

// The car page's 404's heading as the server renders it (DESIGN §7.2.11): a car the site showed is no
// longer listed, with Find a similar car to its body type under it, and any other slug has the site's
// 404 heading and line. What the browser shows after the swap is tests/e2e/car-page.spec.ts's.

const labels = (locale: "ar" | "en") => ({
  notFound: CATALOGS[locale].errors.notFound.title,
  notFoundBody: CATALOGS[locale].errors.notFound.body,
  carGone: CATALOGS[locale].errors.carGone,
  findSimilar: CATALOGS[locale].car.findSimilar,
});

/** The markup's text, with React's escapes read back */
const text = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, "|")
    .split("|")
    .filter(Boolean)
    .map((part) => part.replaceAll("&#x27;", "'").replaceAll("&amp;", "&").replaceAll("&quot;", '"'));

describe("the car's 404's heading", () => {
  it("says a car that was here is no longer listed, and leads to cars of its body type", () => {
    for (const locale of ["ar", "en"] as const) {
      const markup = renderToStaticMarkup(<CarGoneIntro bodyType="suv" locale={locale} labels={labels(locale)} />);
      expect(markup).toMatch(/<h1[^>]*>[^<]*<\/h1>/);
      expect(text(markup), locale).toStrictEqual([CATALOGS[locale].errors.carGone, CATALOGS[locale].car.findSimilar]);
      expect(markup).toContain(`href="/${locale}/cars?body=suv"`);
    }
  });

  it("is the site's 404 heading and line for a car that never was here", () => {
    const markup = renderToStaticMarkup(<CarGoneIntro bodyType={null} locale="en" labels={labels("en")} />);
    expect(text(markup)).toStrictEqual([en.errors.notFound.title, en.errors.notFound.body]);
    expect(markup).not.toContain("<a ");
  });

  it("is the site's until the browser reads what the page's view noted", () => {
    const markup = renderToStaticMarkup(<CarGoneIntro locale="en" labels={labels("en")} />);
    expect(text(markup)).toStrictEqual([en.errors.notFound.title, en.errors.notFound.body]);
  });
});
