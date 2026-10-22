import { expect, test } from "@playwright/test";

// The skeleton's smoke test (SRS §16.1): the production build answers in both locales, in every
// browser and size, with the document's language and direction set and no page or console errors.
// Each screen brings its own journeys, axe and visual tests as it is built.

const DIRECTIONS = { ar: "rtl", en: "ltr" } as const;

for (const [locale, direction] of Object.entries(DIRECTIONS)) {
  test(`/${locale} answers in its language and direction`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`${message.text()} (${message.location().url})`);
    });
    const response = await page.goto(`/${locale}`);
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("html")).toHaveAttribute("dir", direction);
    // Discouraged as a readiness wait, but here it gives late errors time to surface: an error 100 ms
    // after load is missed when only load is awaited. A page that never goes quiet would need its own
    // ready signal instead.
    await page.waitForLoadState("networkidle");
    expect(errors).toStrictEqual([]);
  });
}
