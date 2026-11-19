import { expect, type Locator, type Page, test } from "@playwright/test";
import { CATALOGS } from "../support/catalogs.ts";
import { QUIET, watchBeacons } from "../support/e2e-page.ts";
import { expectProblems, watchProblems } from "../support/page-problems.ts";

// FR-09.7 and DESIGN §7.2.3, on T-21's section lab (/[locale]/dev/sections): a car page section's
// island loads its code, as a lazy chunk of its own, only once the section comes within one viewport
// of the screen. Until the island is in, what the server rendered stands in its place, which is also
// what a browser without script shows. An island that throws, or whose chunk fails to load, leaves
// its section's one muted line under the section's heading and the rest of the page whole, and the
// failure goes to API-03 once (NFR-OBS-02).

const { car } = CATALOGS.en;

const LAB = "/en/dev/sections";

/** What only the chunk of the lab's islands holds */
const ISLAND_MARKER = /muftah-section-lab-island/;

/** A lab island's failure as API-03 receives it, under the catch-all's template as a dev page's */
const LAB_ERROR = { e: "client_error", l: "en", r: "/[locale]/[...rest]", x: "SECTION_LAB" };

/**
 * Records the page's scripts; returns the URLs of those that are the islands' chunk so far, and of
 * any whose body couldn't be read, marked so, as it could be the island's: a check of the chunk
 * fails on it rather than pass for the wrong reason
 */
function watchIsland(page: Page): () => Promise<string[]> {
  const reads: Array<Promise<string | null>> = [];
  page.on("response", (response) => {
    if (response.request().resourceType() !== "script") return;
    reads.push(
      response.text().then(
        (body) => (ISLAND_MARKER.test(body) ? response.url() : null),
        () => `unreadable: ${response.url()}`,
      ),
    );
  });
  return async () => (await Promise.all(reads)).filter((url) => url !== null);
}

/** Opens the lab once it has hydrated, so its islands are watching for their sections */
async function openLab(page: Page): Promise<void> {
  await page.goto(LAB);
  await expect(page.locator("[data-hydrated=true]")).toHaveCount(1);
}

const sectionOf = (page: Page, id: "lab-loaded" | "lab-broken") => page.locator(`section#${id}`);

/** Where the element's top sits in the page */
async function topOf(element: Locator): Promise<number> {
  return element.evaluate((node) => node.getBoundingClientRect().top + window.scrollY);
}

async function scrollTo(page: Page, y: number): Promise<void> {
  await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), Math.round(y));
}

test("loads a section's island only once the section comes within one viewport (FR-09.7)", async ({ page }) => {
  const island = watchIsland(page);
  const section = sectionOf(page, "lab-loaded");
  await openLab(page);
  const viewport = await page.evaluate(() => window.innerHeight);
  const top = await topOf(section);
  // The section starts more than a viewport below the fold, so nothing asks for the island at load
  expect(top).toBeGreaterThan(2.5 * viewport);
  await page.waitForTimeout(QUIET);
  expect(await island()).toStrictEqual([]);

  // Its top a little more than one viewport below the screen: still too far, and the skeleton stands in
  await scrollTo(page, top - 2.2 * viewport);
  await page.waitForTimeout(QUIET);
  expect(await island()).toStrictEqual([]);
  await expect(section.locator(".animate-skeleton")).toHaveCount(1);

  // A little less than one viewport below: the island's chunk comes, and the island takes the
  // skeleton's place
  await scrollTo(page, top - 1.8 * viewport);
  await expect.poll(island).toHaveLength(1);
  await expect(section.getByText("The island is in", { exact: true })).toBeVisible();
  await expect(section.locator(".animate-skeleton")).toHaveCount(0);

  // And its chunk never comes again, through the rest of the page and back
  await scrollTo(page, await page.evaluate(() => document.documentElement.scrollHeight));
  await scrollTo(page, 0);
  await page.waitForTimeout(QUIET);
  expect(await island()).toHaveLength(1);
});

test("keeps the stand-in, marked busy, until the island's chunk is in", async ({ page }) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/_next/static/chunks/**", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (ISLAND_MARKER.test(body)) await held;
    return route.fulfill({ response, body });
  });
  const section = sectionOf(page, "lab-loaded");
  const slot = section.locator(":scope > div");
  await openLab(page);
  await expect(slot).not.toHaveAttribute("aria-busy");
  await section.scrollIntoViewIfNeeded();
  await expect(slot).toHaveAttribute("aria-busy", "true");
  await expect(section.locator(".animate-skeleton")).toBeVisible();
  release();
  await expect(section.getByText("The island is in", { exact: true })).toBeVisible();
  await expect(slot).not.toHaveAttribute("aria-busy");
});

test("leaves the section's line under its heading when its island throws, and the page whole", async ({ page }) => {
  const problems = await watchProblems(page);
  const beacons = watchBeacons(page);
  await openLab(page);
  const broken = sectionOf(page, "lab-broken");
  await broken.scrollIntoViewIfNeeded();
  await expect(broken.getByRole("heading", { level: 2 })).toHaveText("An island that throws");
  await expect(broken.getByText(car.sectionError, { exact: true })).toBeVisible();
  await expect(broken.getByText("The section's static form")).toHaveCount(0);
  await expect.poll(beacons).toStrictEqual([LAB_ERROR]);

  // The other section's island still comes in, and the failure counts once
  const loaded = sectionOf(page, "lab-loaded");
  await loaded.scrollIntoViewIfNeeded();
  await expect(loaded.getByText("The island is in", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForTimeout(QUIET);
  expect(beacons()).toStrictEqual([LAB_ERROR]);
  await expectProblems(page, problems, [/The section lab's island throws on purpose/]);
});

test("leaves the section's line under its heading when its island's chunk fails to load", async ({
  page,
  browserName,
}) => {
  const problems = await watchProblems(page);
  const failed: string[] = [];
  await page.route("**/_next/static/chunks/**", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (!ISLAND_MARKER.test(body)) return route.fulfill({ response, body });
    failed.push(route.request().url());
    return route.abort("internetdisconnected");
  });
  const beacons = watchBeacons(page);
  await openLab(page);
  const loaded = sectionOf(page, "lab-loaded");
  await loaded.scrollIntoViewIfNeeded();
  await expect(loaded.getByRole("heading", { level: 2 })).toHaveText("An island that loads near the screen");
  await expect(loaded.getByText(car.sectionError, { exact: true })).toBeVisible();
  await expect(loaded.locator(".animate-skeleton")).toHaveCount(0);
  await expect.poll(beacons).toStrictEqual([LAB_ERROR]);
  await page.waitForTimeout(QUIET);
  expect(beacons()).toStrictEqual([LAB_ERROR]);
  // Chromium reports each try at the chunk, which Turbopack's runtime makes again once after a
  // network error; WebKit and Firefox report none. Every browser logs the error the section caught,
  // as React logs what a boundary catches.
  const reports = failed.map((url) => `Failed to load resource: net::ERR_INTERNET_DISCONNECTED (${url})`);
  const caught = /^ChunkLoadError: Failed to load chunk /;
  await expectProblems(page, problems, [...(browserName === "chromium" ? reports : []), caught]);
});

test.describe("without script", () => {
  test.use({ javaScriptEnabled: false });

  test("shows each island's stand-in, and no line", async ({ page }) => {
    await page.goto(LAB);
    await expect(sectionOf(page, "lab-loaded").locator(".animate-skeleton")).toHaveCount(1);
    await expect(sectionOf(page, "lab-broken").getByText("The section's static form")).toBeVisible();
    await expect(page.getByText(car.sectionError)).toHaveCount(0);
  });
});
