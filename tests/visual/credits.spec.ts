import { expect, test } from "@playwright/test";

// The Credits page's approved look (SRS §16.2 step 6, DESIGN §7.2.9), in both languages on every
// project: its heading and its first tables, whole on a desktop and scrolling in their frames on a
// phone. The first screen alone: below it, the software table's versions change with each update of
// a dependency, and the e2e test checks its rows (tests/e2e/credits.spec.ts).

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

for (const locale of ["ar", "en"] as const) {
  test(`the Credits page in ${locale}`, async ({ page }) => {
    await page.goto(`/${locale}/credits`);
    await expect(page).toHaveScreenshot(`credits-${locale}.png`);
  });
}
