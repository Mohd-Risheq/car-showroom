import { readFileSync } from "node:fs";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { seriousA11yIssues } from "../support/axe.ts";
import { expectProblems, watchProblems } from "../support/page-problems.ts";

// SCR-14's Credits page (DESIGN §7.2.9) in each language: its title, description and headings, a
// table for each list with rows, the software at the versions package.json pins, zxing-cpp's licence
// served by the site itself, no serious axe issue, and no problem the page reports. On a phone each
// table scrolls in its frame and the page doesn't (D-041); a desktop's reading column holds them whole.
// What the page should show is read from the files it is built from, so the test holds as they change.

type Locale = "ar" | "en";
type Catalog = {
  footer: { credits: string };
  meta: { credits: { description: string } };
  credits: Record<"photos" | "sounds" | "data" | "fonts" | "software", string>;
};
const catalog = (locale: Locale) => JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as Catalog;
const read = <Shape>(file: string) => JSON.parse(readFileSync(file, "utf8")) as Shape;

const manifest = read<{ files: { kind: string }[]; data: unknown[]; fonts: unknown[] }>("public/seed/credits.json");
const software = read<{ rows: { name: string; version?: string; within?: string }[] }>(
  "src/features/credits/software.json",
);
const project = read<Record<"dependencies" | "devDependencies", Record<string, string>>>("package.json");
/** The packages the table lists at their pins: Tailwind CSS's is among the devDependencies (D-048) */
const pins: Record<string, string | undefined> = {
  ...project.dependencies,
  tailwindcss: project.devDependencies.tailwindcss,
};

/** The tables the page shows, in its order: none for a list without rows */
const TABLES = (
  [
    ["photos", manifest.files.filter(({ kind }) => kind === "photo").length],
    ["sounds", manifest.files.filter(({ kind }) => kind === "sound").length],
    ["data", manifest.data.length],
    ["fonts", manifest.fonts.length],
    ["software", software.rows.length],
  ] as const
).filter(([, rows]) => rows > 0);

const ZXING_LICENCE = "/wasm/zxing_reader.LICENSE.txt";

const tableOf = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

/** How far each frame's content reaches past its box, and how far the page's past the screen */
const overflowOf = (page: Page) =>
  page.evaluate(() => ({
    frames: [...document.querySelectorAll("main [role=region][tabindex='0']")].map(
      (frame) => frame.scrollWidth - frame.clientWidth,
    ),
    page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));

/** The text as a pattern that matches it alone */
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Each row heading's text, in the table's order */
const rowHeadings = (table: Locator) => table.getByRole("rowheader").allTextContents();

for (const locale of ["ar", "en"] as const) {
  test.describe(`in ${locale}`, () => {
    test("is named and described as the catalog has it, with a heading and a table for each list", async ({ page }) => {
      const t = catalog(locale);
      const problems = await watchProblems(page);
      await page.goto(`/${locale}/credits`);
      await expect(page).toHaveTitle(new RegExp(`^${t.footer.credits} · `));
      await expect(page.locator("meta[name=description]")).toHaveAttribute("content", t.meta.credits.description);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t.footer.credits);
      // The footer's columns have headings of their own
      await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toHaveText(
        TABLES.map(([table]) => t.credits[table]),
      );
      for (const [table, rows] of TABLES) {
        // Each list's rows, after the row of column headings
        await expect(tableOf(page, t.credits[table]).getByRole("row")).toHaveCount(rows + 1);
      }
      expect(await seriousA11yIssues(page)).toStrictEqual([]);
      await expectProblems(page, problems);
    });

    test("names each runtime dependency at the version package.json pins, bundled works at theirs", async ({
      page,
    }) => {
      const problems = await watchProblems(page);
      await page.goto(`/${locale}/credits`);
      const headings = await rowHeadings(tableOf(page, catalog(locale).credits.software));
      expect(headings).toHaveLength(software.rows.length);
      software.rows.forEach(({ name, version, within }, index) => {
        // A bundled work's heading goes on to say what bundles it
        const served = within === undefined ? pins[name] : version;
        const shown = served === undefined ? name : `${name} ${served}`;
        expect(headings[index], name).toMatch(new RegExp(`^${escaped(shown)}(?: |$)`));
      });
      await expectProblems(page, problems);
    });

    test("serves the zxing-cpp licence its row links to from the site, outside the locale's pages", async ({
      page,
    }) => {
      const problems = await watchProblems(page);
      await page.goto(`/${locale}/credits`);
      const row = tableOf(page, catalog(locale).credits.software).getByRole("row").filter({ hasText: "zxing-cpp" });
      await expect(row.getByRole("link").first()).toHaveAttribute("href", ZXING_LICENCE);
      const response = await page.request.get(ZXING_LICENCE, { maxRedirects: 0 });
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toMatch(/^text\/plain/);
      expect(await response.text()).toContain("Apache License");
      await expectProblems(page, problems);
    });

    test("holds every table in a desktop's reading column", async ({ page, isMobile }) => {
      test.skip(isMobile, "a phone scrolls the tables");
      const problems = await watchProblems(page);
      await page.goto(`/${locale}/credits`);
      const overflow = await overflowOf(page);
      expect(overflow).toStrictEqual({ frames: TABLES.map(() => 0), page: 0 });
      await expectProblems(page, problems);
    });

    test("scrolls each table in its frame on a phone, never the page", async ({ page, isMobile }) => {
      test.skip(!isMobile, "a desktop's reading column holds the tables");
      const problems = await watchProblems(page);
      await page.goto(`/${locale}/credits`);
      const overflow = await overflowOf(page);
      expect(overflow.frames).toHaveLength(TABLES.length);
      for (const frame of overflow.frames) expect(frame).toBeGreaterThan(0);
      expect(overflow.page).toBe(0);
      await expectProblems(page, problems);
    });
  });
}
