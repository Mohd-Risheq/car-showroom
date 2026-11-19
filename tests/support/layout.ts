import type { Page } from "@playwright/test";

// What the public pages' journeys check of their layout: a page at each of a list of sizes, how far
// it reaches past the screen sideways (WCAG 1.4.10), and the icons it shows (DESIGN §3.6)

/** DESIGN §10.2's widths, and one between 768 and 1024, where the header's row is fullest */
export const REFLOW_WIDTHS = [320, 360, 390, 768, 900, 1024, 1440] as const;

/**
 * Loads a page at each size in turn, then checks it there: a visit at the first size and a reload at
 * each after. A second visit to an address in Firefox comes from its cache while the cache
 * revalidates it, as next start's pages allow, and Playwright can wait on that request for good
 * (D-047).
 */
export async function atEachSize(
  page: Page,
  url: string,
  sizes: readonly (readonly [width: number, height: number])[],
  check: (width: number, height: number) => Promise<void>,
) {
  for (const [index, [width, height]] of sizes.entries()) {
    await page.setViewportSize({ width, height });
    if (index === 0) await page.goto(url);
    else await page.reload();
    await check(width, height);
  }
}

/** atEachSize at each width, 800 px tall */
export function atEachWidth(
  page: Page,
  url: string,
  widths: readonly number[],
  check: (width: number) => Promise<void>,
) {
  const sizes = widths.map((width) => [width, 800] as const);
  return atEachSize(page, url, sizes, check);
}

/**
 * How far the page reaches past the screen sideways, in px. A phone's layout viewport grows with
 * what overflows, so the measure is the root's box, the screen's width.
 */
export const sideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Phosphor's icons, drawn on a 256 unit square, each one the page shows, by the control it is in */
export const iconSizes = (page: Page) =>
  page.locator('svg[viewBox="0 0 256 256"]').evaluateAll((elements) =>
    elements.flatMap((icon) => {
      const { width, height } = icon.getBoundingClientRect();
      const control = icon.closest("a, button, summary");
      const name = control?.getAttribute("aria-label") ?? control?.textContent ?? "";
      return width === 0 ? [] : [{ name, width, height }];
    }),
  );
