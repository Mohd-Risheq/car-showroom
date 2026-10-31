import { expect, test } from "@playwright/test";
import { watchProblems } from "../support/page-problems.ts";

// The skeleton's smoke test (SRS §16.1): the production build answers in both locales, in every
// browser and size, with the document's language and direction set, and no page or console error
// or policy violation. Both root layouts give their pages SRS §9.4's viewport.
// Each screen brings its own journeys, axe and visual tests as it is built.

const DIRECTIONS = { ar: "rtl", en: "ltr" } as const;

for (const [locale, direction] of Object.entries(DIRECTIONS)) {
  test(`/${locale} answers in its language and direction`, async ({ page }) => {
    const problems = await watchProblems(page);
    const response = await page.goto(`/${locale}`);
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("html")).toHaveAttribute("dir", direction);
    // Discouraged as a readiness wait, but here it gives late errors time to surface: an error 100 ms
    // after load is missed when only load is awaited. A page that never goes quiet would need its own
    // ready signal instead.
    await page.waitForLoadState("networkidle");
    expect(problems).toStrictEqual([]);
    expect(await page.evaluate(() => window.policyViolations)).toStrictEqual([]);
  });
}

/** SRS §9.4's viewport, which never limits zoom (src/styles/viewport.ts) */
const VIEWPORT = "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content";

// A page of the site, the site's 404 and a dealer page, under the two root layouts
for (const path of ["/ar", "/en/nothing", "/en/dealer/dev/tokens"]) {
  test(`${path} has SRS §9.4's viewport`, async ({ page }) => {
    await page.goto(path);
    const viewport = page.locator('meta[name="viewport"]');
    await expect(viewport).toHaveCount(1);
    await expect(viewport).toHaveAttribute("content", VIEWPORT);
  });
}
