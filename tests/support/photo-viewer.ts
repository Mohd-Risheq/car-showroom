import { expect, type Page } from "@playwright/test";

// The car page's fullscreen viewer (FR-10), as its journeys and its baselines see it

/** The viewer: the page's dialog while it is open */
export const viewer = (page: Page) => page.getByRole("dialog");

/**
 * Waits for the viewer to show and its entrance to end, which starts as Base UI lets go of its
 * starting style
 */
export async function settled(page: Page) {
  await expect(viewer(page)).toBeVisible();
  await expect(viewer(page)).not.toHaveAttribute("data-starting-style");
  await viewer(page).evaluate((dialog) =>
    Promise.all(dialog.getAnimations({ subtree: true }).map(({ finished }) => finished)).then(() => 0),
  );
}
