import { expect, type Locator, type Page } from "@playwright/test";

// Helpers for the token specimens (/[locale]/dev/tokens and /[locale]/dealer/dev/tokens)

/** Opens a specimen once what renders after hydration, the measurements and the token list, is in */
export async function openSpecimen(page: Page, path = "/en/dev/tokens"): Promise<void> {
  await page.goto(path);
  await expect(page.locator("[data-token-count]")).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/**
 * Emulates a contrast preference for the open page, then loads it again under it. Firefox as
 * Playwright 1.64 drives it loses a contrast emulated before the first page loads, and doesn't
 * restyle a page that is already open, so a page must be open first.
 */
export async function emulateContrast(page: Page, contrast: "more" | "no-preference"): Promise<void> {
  await page.emulateMedia({ contrast });
  await page.reload();
  expect(await page.evaluate(() => matchMedia("(prefers-contrast: more)").matches)).toBe(contrast === "more");
}

/** A CSS value as the browser computes it for a property, such as a token's colour or size */
export async function computed(page: Page, property: "color" | "font-size", value: string): Promise<string> {
  return page.evaluate(
    ([name, css]) => {
      const probe = document.createElement("i");
      probe.style.setProperty(name, css);
      document.body.append(probe);
      const result = getComputedStyle(probe).getPropertyValue(name);
      probe.remove();
      return result;
    },
    [property, value] as const,
  );
}

/** The element's outline, as its style, width and colour */
export async function outlineOf(element: Locator): Promise<[style: string, width: string, colour: string]> {
  return element.evaluate((node) => {
    const style = getComputedStyle(node);
    return [style.outlineStyle, style.outlineWidth, style.outlineColor];
  });
}
