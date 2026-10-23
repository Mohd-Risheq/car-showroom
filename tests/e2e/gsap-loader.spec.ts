import { expect, type Locator, type Page, test } from "@playwright/test";
import { watchProblems } from "../support/page-problems.ts";
import { openSpecimen } from "../support/specimen.ts";

// SRS §11.8 and T-13's Verify: GSAP and ScrollTrigger load once, as one lazy chunk, when the first
// scrubbed section comes within one viewport of a screen that scrubs (DESIGN §4.4), and are never
// requested at 390 px. The public token specimen's length line is a scrubbed section
// (src/app/_dev/specimen/motion-demos.tsx).

const SPECIMEN = "/en/dev/tokens";

/** What only GSAP's chunk holds: ScrollTrigger registering itself by name */
const GSAP_MARKER = /["'`]ScrollTrigger["'`]/;

/** How long a test waits for a request that must not come. The desktop tests see it come far sooner. */
const QUIET = 1500;

/** Records the page's scripts; returns the URLs of those that are GSAP's chunk so far */
function watchGsap(page: Page): () => Promise<string[]> {
  const reads: Array<Promise<string | null>> = [];
  page.on("response", (response) => {
    if (response.request().resourceType() !== "script") return;
    reads.push(
      response.text().then(
        (body) => (GSAP_MARKER.test(body) ? response.url() : null),
        () => null,
      ),
    );
  });
  return async () => (await Promise.all(reads)).filter((url) => url !== null);
}

function demoOf(page: Page) {
  const demo = page.locator('[data-demo="Scrub"]');
  return { demo, line: demo.locator("[data-scrub-line]").nth(1) };
}

/** Where the element's top sits in the page, and its height */
async function placeOf(element: Locator): Promise<{ top: number; height: number }> {
  return element.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return { top: box.top + window.scrollY, height: box.height };
  });
}

async function scrollTo(page: Page, y: number): Promise<void> {
  await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), Math.round(y));
}

/** The line's stroke-dashoffset: 1 hides it, 0 draws it in full */
async function offsetOf(line: Locator): Promise<number> {
  return line.evaluate((node) => Number.parseFloat(getComputedStyle(node).strokeDashoffset));
}

test("never requests GSAP at 390 px, with the scrubbed line on screen and past it", async ({ page }) => {
  const gsap = watchGsap(page);
  const { demo, line } = demoOf(page);
  await page.setViewportSize({ width: 390, height: 844 });
  // After hydration, so the quiet wait covers the client code that would load GSAP
  await openSpecimen(page, SPECIMEN);
  await demo.scrollIntoViewIfNeeded();
  await page.waitForTimeout(QUIET);
  await scrollTo(page, await page.evaluate(() => document.documentElement.scrollHeight));
  await page.waitForTimeout(QUIET);
  expect(await gsap()).toStrictEqual([]);
  // The line stays as it was rendered: drawn
  expect(await offsetOf(line)).toBe(0);
});

test.describe("on a desktop", () => {
  test.skip(({ isMobile }) => isMobile, "a phone never scrubs");

  test("requests GSAP once, when the scrubbed line comes within one viewport", async ({ page }) => {
    const gsap = watchGsap(page);
    const { demo } = demoOf(page);
    await openSpecimen(page, SPECIMEN);
    const viewport = await page.evaluate(() => window.innerHeight);
    const { top } = await placeOf(demo);
    // The line starts more than a viewport below the fold, so nothing asks for GSAP at load
    expect(top).toBeGreaterThan(2.5 * viewport);
    await page.waitForTimeout(QUIET);
    expect(await gsap()).toStrictEqual([]);

    // Its top a little more than one viewport below the screen: still too far
    await scrollTo(page, top - 2.2 * viewport);
    await page.waitForTimeout(QUIET);
    expect(await gsap()).toStrictEqual([]);

    // A little less than one viewport below: GSAP's chunk is requested
    await scrollTo(page, top - 1.8 * viewport);
    await expect.poll(gsap).toHaveLength(1);

    // And never again, through the rest of the page and back
    await scrollTo(page, await page.evaluate(() => document.documentElement.scrollHeight));
    await scrollTo(page, 0);
    await page.waitForTimeout(QUIET);
    expect(await gsap()).toHaveLength(1);
  });

  test("scrubs the line with the scroll, with no policy violation, and leaves it drawn once the screen narrows", async ({
    page,
  }) => {
    const problems = await watchProblems(page);
    const gsap = watchGsap(page);
    const { demo, line } = demoOf(page);
    await openSpecimen(page, SPECIMEN);
    const viewport = await page.evaluate(() => window.innerHeight);
    const { top, height } = await placeOf(demo);
    // The scrub runs from the line's top at the screen's bottom to its middle at the screen's middle
    const start = top - viewport;
    const end = top + height / 2 - viewport / 2;

    await scrollTo(page, start);
    await expect.poll(gsap).toHaveLength(1);
    await expect.poll(() => offsetOf(line)).toBeCloseTo(1, 2);
    await scrollTo(page, (start + end) / 2);
    await expect.poll(() => offsetOf(line)).toBeCloseTo(0.5, 2);
    await scrollTo(page, end);
    await expect.poll(() => offsetOf(line)).toBeCloseTo(0, 2);

    // Below 1024 px the scrub is reverted, and the line is as it was rendered
    await scrollTo(page, (start + end) / 2);
    await page.setViewportSize({ width: 1000, height: viewport });
    await expect
      .poll(() => line.evaluate((node) => node.getAttribute("style") ?? ""))
      .not.toContain("stroke-dashoffset");
    expect(await offsetOf(line)).toBe(0);

    expect(problems).toStrictEqual([]);
    expect(await page.evaluate(() => window.policyViolations)).toStrictEqual([]);
  });

  test("measures the scrub again when content above the line changes the page's height", async ({ page }) => {
    const { demo, line } = demoOf(page);
    await openSpecimen(page, SPECIMEN);
    const viewport = await page.evaluate(() => window.innerHeight);
    const before = await placeOf(demo);
    await scrollTo(page, before.top - viewport);
    await expect.poll(() => offsetOf(line)).toBeCloseTo(1, 2);

    // Content arrives above the line once the scrub runs, as streamed content can
    await page.evaluate(() => {
      const block = document.createElement("div");
      block.style.height = "400px";
      document.querySelector("main")?.prepend(block);
    });
    const { top, height } = await placeOf(demo);
    // At least 400 px down, give or take subpixel layout
    expect(top).toBeGreaterThan(before.top + 399);
    const start = top - viewport;
    const end = top + height / 2 - viewport / 2;
    await scrollTo(page, (start + end) / 2);
    await expect.poll(() => offsetOf(line)).toBeCloseTo(0.5, 2);
  });

  test("never requests GSAP under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const gsap = watchGsap(page);
    const { demo, line } = demoOf(page);
    await openSpecimen(page, SPECIMEN);
    await demo.scrollIntoViewIfNeeded();
    await page.waitForTimeout(QUIET);
    expect(await gsap()).toStrictEqual([]);
    expect(await offsetOf(line)).toBe(0);
  });
});
