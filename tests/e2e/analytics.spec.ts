import { expect, type Page, type Request, test } from "@playwright/test";
import { expectProblems, watchProblems } from "../support/page-problems.ts";

// FR-47's client in the browser. On the shell lab's failing page, whose segment error reports itself
// (NFR-OBS-02): with Global Privacy Control on, the page sends no beacon (FR-47.3, TC-47-3); with it
// off, the error goes to API-03 as one beacon of text/plain JSON, which answers 204 and sets no
// cookie (FR-47). A dev path names its page by the catch-all's template. On the analytics lab's two
// pages, which stand in for two cars' pages: a page view's events across navigations (FR-47.6),
// nothing at all with Global Privacy Control on, and an error nothing catches, counted once.

/** The mark in session storage that makes the lab's failing page fail (dev/shell/failing) */
const FAIL_KEY = "muftah:fail";
const FAILING = "/en/dev/shell/failing";
/** How long a test waits for a beacon that must not come. The page's own comes far sooner. */
const QUIET = 1500;

/** The analytics lab's cars (dev/analytics) */
const LAB_CARS = ["01923456-7890-7abc-8def-0000000000a1", "01923456-7890-7abc-8def-0000000000a2"] as const;

/** The error the failing page throws, which React reports, and Firefox prints without its message */
const FAILED_PAGE = [/^Error\b/];

const isBeacon = (url: string) => new URL(url).pathname === "/api/events";

/** What only the beacon's chunk holds: API-03's address (src/lib/analytics/beacon.ts) */
const BEACON_MARKER = /["'`]\/api\/events["'`]/;

/** Turns Global Privacy Control on in the page's browser, as Firefox and Brave can */
async function turnOnGpc(page: Page) {
  await page.addInitScript(() =>
    Object.defineProperty(Navigator.prototype, "globalPrivacyControl", { configurable: true, get: () => true }),
  );
}

/** The scripts the page loads that hold the beacon */
function watchBeaconScripts(page: Page): string[] {
  const scripts: string[] = [];
  page.on("response", async (response) => {
    if (response.request().resourceType() !== "script") return;
    if (BEACON_MARKER.test(await response.text().catch(() => ""))) scripts.push(response.url());
  });
  return scripts;
}

/** The beacons the page sends to API-03 */
function watchBeacons(page: Page): Request[] {
  const beacons: Request[] = [];
  page.on("request", (request) => {
    if (isBeacon(request.url())) beacons.push(request);
  });
  return beacons;
}

test.describe("the failing page", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((key) => sessionStorage.setItem(key, "1"), FAIL_KEY);
  });

  test("sends no beacon, and loads nothing to send one, with Global Privacy Control on (TC-47-3)", async ({ page }) => {
    const problems = await watchProblems(page);
    await turnOnGpc(page);
    const beacons = watchBeacons(page);
    const scripts = watchBeaconScripts(page);
    await page.goto(FAILING);
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    await page.waitForTimeout(QUIET);
    expect(beacons).toStrictEqual([]);
    expect(scripts).toStrictEqual([]);
    await expectProblems(page, problems, FAILED_PAGE);
  });

  test("sends the page's error as one beacon of text/plain JSON, answered 204 with no cookie", async ({ page }) => {
    const problems = await watchProblems(page);
    const beacons = watchBeacons(page);
    const answered = page.waitForResponse((response) => isBeacon(response.url()));
    await page.goto(FAILING);
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    const response = await answered;
    const request = response.request();
    expect(request.method()).toBe("POST");
    expect(await request.headerValue("content-type")).toMatch(/^text\/plain\b/);
    expect(request.postDataJSON()).toStrictEqual({
      e: "client_error",
      l: "en",
      r: "/[locale]/[...rest]",
      x: "SEGMENT",
    });
    expect(response.status()).toBe(204);
    expect(await response.headerValue("set-cookie")).toBeNull();
    await page.waitForTimeout(QUIET);
    expect(beacons).toHaveLength(1);
    await expectProblems(page, problems, FAILED_PAGE);
  });
});

test("sends a page view's events once each, a contact each time, and a page's view in each page view (FR-47.6)", async ({
  page,
}) => {
  const problems = await watchProblems(page);
  const [first, second] = LAB_CARS;
  const beacons = watchBeacons(page);
  const bodies = () => beacons.map((request) => request.postDataJSON() as unknown);
  const sent: unknown[] = [];
  const expectSent = async (...more: unknown[]) => {
    sent.push(...more);
    await expect.poll(bodies).toStrictEqual(sent);
  };
  const press = async (name: string, times: number) => {
    for (let i = 0; i < times; i += 1) await page.getByRole("button", { name }).click();
  };

  await page.goto("/en/dev/analytics");
  await expectSent({ e: "car_view", c: first, l: "en" });
  await press("Spin", 3);
  await press("WhatsApp", 2);
  await expectSent(
    { e: "sig_spin", c: first, l: "en" },
    { e: "contact_whatsapp", c: first, l: "en" },
    { e: "contact_whatsapp", c: first, l: "en" },
  );

  // The next car's page, by a link: a page view of its own
  await page.getByRole("link", { name: "The second car" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Analytics lab, second car" })).toBeVisible();
  await expectSent({ e: "car_view", c: second, l: "en" });
  await press("Spin", 2);
  await expectSent({ e: "sig_spin", c: second, l: "en" });

  // Back to the first car's page, which Next.js may show as it kept it: a new page view all the same
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "Analytics lab", exact: true })).toBeVisible();
  await expectSent({ e: "car_view", c: first, l: "en" });
  await press("Spin", 2);
  await expectSent({ e: "sig_spin", c: first, l: "en" });

  await page.waitForTimeout(QUIET);
  expect(bodies()).toStrictEqual(sent);
  await expectProblems(page, problems);
});

test("sends nothing from the lab's pages with Global Privacy Control on, and loads nothing to (TC-47-3)", async ({
  page,
}) => {
  const problems = await watchProblems(page);
  await turnOnGpc(page);
  const beacons = watchBeacons(page);
  const scripts = watchBeaconScripts(page);
  await page.goto("/en/dev/analytics");
  await page.getByRole("button", { name: "Spin" }).click();
  await page.getByRole("button", { name: "WhatsApp" }).click();
  await page.getByRole("link", { name: "The second car" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Analytics lab, second car" })).toBeVisible();
  await page.waitForTimeout(QUIET);
  expect(beacons).toStrictEqual([]);
  expect(scripts).toStrictEqual([]);
  await expectProblems(page, problems);
});

test("sends an error nothing caught as UNCAUGHT, once for its page however often it's thrown (NFR-OBS-02)", async ({
  page,
}) => {
  const problems = await watchProblems(page);
  const beacons = watchBeacons(page);
  const errors = () =>
    beacons.map((request) => request.postDataJSON() as { e: string }).filter(({ e }) => e === "client_error");
  await page.goto("/en/dev/analytics");
  await expect.poll(() => beacons.length).toBe(1);
  for (let i = 0; i < 2; i += 1) await page.getByRole("button", { name: "Fail" }).click();
  const uncaught = { e: "client_error", l: "en", r: "/[locale]/[...rest]", x: "UNCAUGHT" };
  await expect.poll(errors).toStrictEqual([uncaught]);
  await page.waitForTimeout(QUIET);
  expect(errors()).toStrictEqual([uncaught]);
  await expectProblems(page, problems, [/The analytics lab's tap 1 failed/, /The analytics lab's tap 2 failed/]);
});
