import { expect, type Page, test } from "@playwright/test";

// The privacy page's approved look (SRS §16.2 step 6, DESIGN §7.2.9), in both languages on every
// project: its reading column, lists and table, whole on a desktop and scrolling in its frame on a
// phone. The footer's year is masked, so a new year changes no baseline.

const year = (page: Page) => page.locator("footer").getByText(/^©/);

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

for (const locale of ["ar", "en"] as const) {
  test(`the privacy page in ${locale}`, async ({ page }) => {
    await page.goto(`/${locale}/privacy`);
    await expect(page).toHaveScreenshot(`privacy-${locale}.png`, { fullPage: true, mask: [year(page)] });
  });
}
