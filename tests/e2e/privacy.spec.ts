import { readFileSync } from "node:fs";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { seriousA11yIssues } from "../support/axe.ts";
import { expectProblems, watchProblems } from "../support/page-problems.ts";

// SCR-14's privacy page (FR-47.5, DESIGN §7.2.9) in each language: its title, description and one
// heading, what the site keeps in one table, and no serious axe issue. On a phone the table scrolls
// in its frame and the page doesn't, each row's heading held in view as the rest scrolls (D-041); a
// desktop's reading column holds the whole table.

type Catalog = { footer: { privacy: string }; meta: { privacy: { description: string } } };
const catalog = (locale: "ar" | "en") => JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as Catalog;

/** The table's frame, by the name each language's MDX gives it */
const TABLE = { ar: "ما يحفظه الموقع", en: "What the site keeps" } as const;
/** The rows the table has: its column headings, then each thing the site keeps */
const ROWS = 10;

const tableOf = (page: Page, locale: "ar" | "en") => page.getByRole("region", { name: TABLE[locale] });

/** How far the frame's content reaches past its box, and how far the page's past the screen */
const overflowOf = (frame: Locator) =>
  frame.evaluate((element) => ({
    frame: element.scrollWidth - element.clientWidth,
    page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));

for (const locale of ["ar", "en"] as const) {
  test.describe(`in ${locale}`, () => {
    test("is named and described as the catalog has it, with one heading and the table", async ({ page }) => {
      const t = catalog(locale);
      const problems = await watchProblems(page);
      await page.goto(`/${locale}/privacy`);
      await expect(page).toHaveTitle(new RegExp(`^${t.footer.privacy} · `));
      await expect(page.locator("meta[name=description]")).toHaveAttribute("content", t.meta.privacy.description);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t.footer.privacy);
      await expect(tableOf(page, locale).getByRole("row")).toHaveCount(ROWS);
      expect(await seriousA11yIssues(page)).toStrictEqual([]);
      await expectProblems(page, problems);
    });

    test("holds the whole table in a desktop's reading column", async ({ page, isMobile }) => {
      test.skip(isMobile, "a phone scrolls the table");
      await page.goto(`/${locale}/privacy`);
      expect(await overflowOf(tableOf(page, locale))).toStrictEqual({ frame: 0, page: 0 });
    });

    test("scrolls the table in its frame on a phone, not the page, each row's heading held in view", async ({
      page,
      isMobile,
    }) => {
      test.skip(!isMobile, "a desktop's reading column holds the table");
      await page.goto(`/${locale}/privacy`);
      const frame = tableOf(page, locale);
      const overflow = await overflowOf(frame);
      expect(overflow.frame).toBeGreaterThan(0);
      expect(overflow.page).toBe(0);

      const heading = frame.getByRole("rowheader").first();
      const cell = frame.getByRole("cell").first();
      const [headingBefore, cellBefore] = [await heading.boundingBox(), await cell.boundingBox()];
      // Towards the table's end: right in English, left in Arabic
      await frame.evaluate(
        (element, by) => element.scrollBy({ left: by, behavior: "instant" }),
        locale === "ar" ? -150 : 150,
      );
      await expect.poll(async () => (await cell.boundingBox())?.x).not.toBe(cellBefore?.x);
      expect((await heading.boundingBox())?.x).toBe(headingBefore?.x);
      // Opaque, in the page's own colour, so the cells under them don't show through
      const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      for (const held of [heading, frame.getByRole("columnheader").first()]) {
        expect(await held.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(background);
      }
    });
  });
}
