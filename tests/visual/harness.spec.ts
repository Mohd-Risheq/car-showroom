import { expect, test } from "@playwright/test";
import { harnessPage } from "../support/harness-pages.ts";

// Visual regression (SRS §16.2 step 6) on the pages in tests/fixtures/checks/visual (BUILD-PLAN §6.2):
// the clean page matches its approved baseline, and the planted page, the same page with the button's
// colour changed, fails against that baseline. Both go through toHaveScreenshot, so they capture and
// compare as every screen's baselines do. Screens bring their own baselines as they are built.

const BASELINE = "harness.png";

// In order, so the planted page is compared with the baseline the clean page has just been checked against
test.describe.configure({ mode: "default" });

test("the clean page matches its approved baseline", async ({ page }) => {
  await page.setContent(harnessPage("visual", "clean"));
  await expect(page).toHaveScreenshot(BASELINE);
});

test("the planted page fails against the same baseline", async ({ page }) => {
  await page.setContent(harnessPage("visual", "planted"));
  // A negated screenshot check never writes a baseline, so updating baselines can't approve the planted page
  await expect(page).not.toHaveScreenshot(BASELINE);
});
