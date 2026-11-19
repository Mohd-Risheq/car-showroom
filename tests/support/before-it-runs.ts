import type { Page, Response } from "@playwright/test";

/**
 * Opens the page, holding its scripts back until run is called, as on a slow phone: what the server
 * sent is on show, and the page hasn't hydrated
 */
export async function openBeforeItRuns(
  page: Page,
  path: string,
): Promise<{ response: Response | null; run: () => void }> {
  const scripts = Promise.withResolvers<void>();
  await page.route("**/_next/static/chunks/**", async (route) => {
    if (route.request().resourceType() === "script") await scripts.promise;
    await route.continue();
  });
  const response = await page.goto(path, { waitUntil: "commit" });
  return { response, run: scripts.resolve };
}
