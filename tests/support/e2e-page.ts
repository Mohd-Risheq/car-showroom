import { expect, type Locator, type Page } from "@playwright/test";
import type { IngestedEvent } from "../../src/lib/analytics/events.ts";
import type { AppLocale } from "../../src/lib/i18n/locales.ts";
import { CATALOGS } from "./catalogs.ts";

// What the public site's journeys share: how long a test waits for what must not come, the width
// the desktop's layout starts at, the wait for a page to run, and for the English offer to have its
// room, the key that moves the focus on, the footer's link to the privacy page, the beacons a page
// sends (FR-47), and Share made to copy, as it does in a browser without a share sheet (FR-09.11).

declare global {
  interface Window {
    /** The texts Share wrote to the clipboard, in order (copyOnShare) */
    copied: string[];
  }
}

/**
 * How long a test waits for something that must not come, such as a beacon, a request or a toast.
 * What the page does send comes far sooner.
 */
export const QUIET = 1500;

/** The width the desktop's layout starts at: tokens.css's lg (DESIGN §8) */
export const DESKTOP_FROM = 1024;

/** Waits for the page to hydrate: the toaster's region comes once it has */
export const hydrated = (page: Page, locale: AppLocale) =>
  expect(page.getByRole("region", { name: CATALOGS[locale].common.notifications })).toBeAttached();

/**
 * Waits for the English offer on an Arabic page, and for the room the page keeps for it at its end
 * and in its scroll padding, which comes once the card is measured, the frame after it comes in
 * (locale-prompt.tsx). Sooner, a scroll near the page's end stops short, and the focus can scroll
 * in under the card.
 */
export async function offerShown(page: Page) {
  await expect(page.locator("[data-locale-prompt]")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--prompt-height")))
    .not.toBe("");
}

/** The key that moves the focus on: Safari moves to links and buttons with Option-Tab */
export const tabKey = (browserName: string) => (browserName === "webkit" ? "Alt+Tab" : "Tab");

/** The footer's link to the privacy page */
export const privacyLink = (page: Page, locale: AppLocale): Locator =>
  page.locator("footer").getByRole("link", { name: CATALOGS[locale].footer.privacy, exact: true });

/** The beacons the page sends to API-03 from now on, as their bodies: the event's, or every one */
export function watchBeacons(page: Page, event?: IngestedEvent): () => unknown[] {
  const bodies: { e: string }[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/events") bodies.push(request.postDataJSON() as { e: string });
  });
  return () => bodies.filter(({ e }) => event === undefined || e === event);
}

/**
 * Takes the share sheet away and stubs the clipboard, so Share copies the car's address, and gives
 * what it copied
 */
export async function copyOnShare(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const copied: string[] = [];
    Object.defineProperty(window, "copied", { value: copied });
    Object.defineProperty(Navigator.prototype, "share", { configurable: true, value: undefined });
    Object.defineProperty(Navigator.prototype, "clipboard", {
      configurable: true,
      get: () => ({
        writeText: (text: string) => {
          copied.push(text);
          return Promise.resolve();
        },
      }),
    });
  });
  return () => page.evaluate(() => window.copied);
}
