import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

// The public shell's approved looks (SRS §16.2 step 6): the 404, which draws the whole shell around
// it, in both languages on every project, and the phone menu, open, on the phone projects. The
// footer's year is masked, so a new year changes no baseline. Motion is reduced, so the 404's scan
// line rests where its crossing ends (DESIGN §7.2.11).

type Catalog = { nav: { menu: string } };
const catalog = (locale: "ar" | "en") => JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as Catalog;
const LOCALES = ["ar", "en"] as const;
/** Below this width the header folds its links into the menu (FR-02.7) */
const MENU_BELOW = 768;

const year = (page: Page) => page.locator("footer").getByText(/^©/);

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

for (const locale of LOCALES) {
  test(`the 404 in ${locale}`, async ({ page }) => {
    await page.goto(`/${locale}/nothing`);
    await expect(page).toHaveScreenshot(`not-found-${locale}.png`, { fullPage: true, mask: [year(page)] });
  });

  test(`the phone menu, open, in ${locale}`, async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= MENU_BELOW, "the header shows its links from 768 px");
    await page.goto(`/${locale}`);
    await page.getByRole("button", { name: catalog(locale).nav.menu }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page).toHaveScreenshot(`menu-${locale}.png`);
  });
}
