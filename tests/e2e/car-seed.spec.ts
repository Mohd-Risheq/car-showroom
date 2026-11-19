import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { CarFixtures, seedCar } from "../support/car-fixture.ts";
import { CATALOGS } from "../support/catalogs.ts";
import { hydrated } from "../support/e2e-page.ts";
import { expectProblems, watchProblems } from "../support/page-problems.ts";

// T-21's Done-when in the browser: each car the seed shows has its whole page in both languages,
// under its title, with a value for each key fact it lists, no message's key in place of its words,
// and no problem once the page has hydrated. A car's own values pick some of its words, its fuel's
// or its colour's, so only a page with that car shows them. tests/integration/seed-pages.test.ts
// holds each car's page on the server's side, and car-page.spec.ts the page itself, on s01 and the
// copies it makes.

const LOCALES = ["ar", "en"] as const;

/** The seed's cars the public sees: all but its draft */
const PUBLIC_CARS = (
  JSON.parse(readFileSync("seed/cars.json", "utf8")) as { seedKey: string; status: string }[]
).filter(({ status }) => status !== "draft");

/**
 * A message's key in place of its words, as the page shows one its catalog lacks (src/lib/i18n/
 * request.ts): one of the catalog's namespaces, a dot, then the rest of the key
 */
const MESSAGE_KEY = new RegExp(`(?<![\\w.])(?:${Object.keys(CATALOGS.en).join("|")})\\.[A-Za-z][\\w.]*`, "g");

const fixtures = new CarFixtures();
test.afterEach(() => fixtures.remove());

/** The page's words, as a visitor reads or hears them: its title, its text, and its elements' names */
const wordsOf = (page: Page) =>
  page.evaluate(() => {
    const words = [document.title, document.querySelector('meta[name="description"]')?.getAttribute("content") ?? ""];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.parentElement?.closest("script, style, noscript") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) words.push(node.textContent ?? "");
    for (const element of document.querySelectorAll("[aria-label], [alt], [title], [placeholder]")) {
      for (const name of ["aria-label", "alt", "title", "placeholder"]) words.push(element.getAttribute(name) ?? "");
    }
    return words.join("\n");
  });

/** The key facts' values, under their heading, which only screen readers get */
const factsOf = (page: Page, locale: "ar" | "en") =>
  page
    .locator("section", { has: page.getByRole("heading", { level: 2, name: CATALOGS[locale].car.facts.title }) })
    .locator("dd");

/** Whether a project sweeps the seed: Chromium on a desktop and WebKit on a phone, each layout once */
const sweeps = (browserName: string, isMobile: boolean) =>
  (browserName === "chromium" && !isMobile) || (browserName === "webkit" && isMobile);

test.describe("each car the seed shows", () => {
  test.skip(
    ({ browserName, isMobile }) => !sweeps(browserName, isMobile),
    "Chromium on a desktop and WebKit on a phone sweep the seed",
  );

  for (const { seedKey, status } of PUBLIC_CARS) {
    test(`${seedKey}, ${status}, has its whole page in Arabic and English`, async ({ page }) => {
      const car = await seedCar(seedKey);
      // The seed's sold cars were sold days before it was loaded, and a sold car's page goes once the
      // dealer's window has: a copy sold now stands in for each
      const slug = status === "sold" ? await fixtures.copy(seedKey, "sold") : car.slug;
      const problems = await watchProblems(page);
      for (const locale of LOCALES) {
        expect((await page.goto(`/${locale}/cars/${slug}`))?.status(), locale).toBe(200);
        await hydrated(page, locale);
        await expect(page.getByRole("heading", { level: 1 }), locale).toHaveText(car.title[locale]);
        const facts = await factsOf(page, locale).allTextContents();
        expect(facts.length, locale).toBeGreaterThan(0);
        expect(
          facts.filter((value) => value.trim() === "" || value.includes("N/A")),
          locale,
        ).toStrictEqual([]);
        expect((await wordsOf(page)).match(MESSAGE_KEY) ?? [], locale).toStrictEqual([]);
      }
      await expectProblems(page, problems);
    });
  }
});
