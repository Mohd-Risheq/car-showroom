import { readFileSync } from "node:fs";
import { expect, type Page, type Response, test } from "@playwright/test";
import { expectProblems, watchProblems } from "../support/page-problems.ts";

// SCR-11's 404 (DESIGN §7.2.11, D-047): every unknown path under a locale, and every path the proxy
// sends on to one, answers 404 with the localized view in the site's shell, kept out of search
// engines. The view is in the server's HTML, so it works without JavaScript, and its search takes the
// visitor to the cars page. Neither the page nor its swap after hydration reports a problem.

type Catalog = {
  common: { notifications: string };
  errors: { notFound: { title: string } };
  nav: { search: string; cars: string };
};
const catalog = (locale: "ar" | "en") => JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as Catalog;
const CATALOGS = { ar: catalog("ar"), en: catalog("en") };

/**
 * A path and the locale whose 404 it gets: an unprefixed one goes to Arabic, the default, and so does
 * another locale's prefix, which proxy.ts rewrites to it
 */
type Case = { path: string; locale: "ar" | "en"; rewritten?: true };
const CASES: readonly Case[] = [
  { path: "/ar/nothing", locale: "ar" },
  { path: "/en/nothing/deeper", locale: "en" },
  // A page the site links to before it is built
  { path: "/en/cars", locale: "en" },
  { path: "/ar/cars.", locale: "ar" },
  { path: "/fr/cars", locale: "ar", rewritten: true },
  { path: "/cars.", locale: "ar" },
  { path: "/x.y", locale: "ar" },
  { path: "/fr/x.y", locale: "ar", rewritten: true },
];

/** Waits for the page to hydrate, its view swapped for not-found.tsx's: the toaster's region comes once it has */
const hydrated = (page: Page, locale: "ar" | "en") =>
  expect(page.getByRole("region", { name: CATALOGS[locale].common.notifications })).toBeAttached();

async function expectNotFoundView(page: Page, locale: "ar" | "en") {
  const title = CATALOGS[locale].errors.notFound.title;
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  // Next.js adds a noindex tag of its own once the page runs, so there may be two, both noindex
  const robots = await page
    .locator("meta[name=robots]")
    .evaluateAll((tags) => tags.map((tag) => tag.getAttribute("content") ?? ""));
  expect(robots.length).toBeGreaterThan(0);
  for (const content of robots) expect(content).toMatch(/noindex/);
  await expect(page).toHaveTitle(new RegExp(`^${title} · `));
}

for (const { path, locale, rewritten } of CASES) {
  test(`${path} answers 404 with the ${locale} view`, async ({ page, baseURL }) => {
    // Through the HTTPS front, Next.js fetches proxy.ts's rewrite from the server over HTTPS, which it
    // doesn't speak (tests/support/https-proxy.ts, D-041): the other projects ask the server itself
    const overHttps = baseURL?.startsWith("https:") ?? false;
    test.skip(rewritten === true && overHttps, "the HTTPS front can't serve a rewrite in proxy.ts");
    const problems = await watchProblems(page);
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expectNotFoundView(page, locale);
    await hydrated(page, locale);
    await expectProblems(page, problems);
  });
}

test("a missing file gets a plain 404, not a page", async ({ page }) => {
  const response = await page.goto("/x.png");
  expect(response?.status()).toBe(404);
  expect(response?.request().redirectedFrom()).toBeNull();
  expect(new URL(response?.url() ?? "about:blank").pathname).toBe("/x.png");
  for (const locale of ["ar", "en"] as const) {
    await expect(page.getByRole("heading", { name: CATALOGS[locale].errors.notFound.title })).toHaveCount(0);
  }
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the view is in the server's HTML, search included", async ({ page }) => {
    const response = await page.goto("/ar/nothing");
    expect(response?.status()).toBe(404);
    await expectNotFoundView(page, "ar");
    await expect(page.getByRole("searchbox", { name: CATALOGS.ar.nav.search })).toBeVisible();
  });
});

test("the search sends its words to the cars page", async ({ page }) => {
  const problems = await watchProblems(page);
  await page.goto("/en/nothing");
  const search = page.getByRole("searchbox", { name: CATALOGS.en.nav.search });
  await search.fill("rav4");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/en\/cars\?q=rav4$/);
  await expectProblems(page, problems);
});

/** Opens a 404, holding its scripts back until run is called, as on a slow phone */
async function openBeforeItRuns(
  page: Page,
  path = "/en/nothing",
): Promise<{ response: Response | null; run: () => void }> {
  const scripts = Promise.withResolvers<void>();
  await page.route("**/_next/static/chunks/**", async (route) => {
    if (route.request().resourceType() === "script") await scripts.promise;
    await route.continue();
  });
  const response = await page.goto(path, { waitUntil: "commit" });
  return { response, run: scripts.resolve };
}

test("words typed before the page runs stay in the search, with its focus and caret", async ({ page }) => {
  const problems = await watchProblems(page);
  const { run } = await openBeforeItRuns(page);
  const search = page.getByRole("searchbox", { name: CATALOGS.en.nav.search });
  await search.fill("rav4");
  // The caret within the words, where the new field's own would not be
  await search.press("ArrowLeft");
  await search.press("ArrowLeft");
  const typedInto = await search.elementHandle();
  run();
  // Once the page runs, not-found.tsx renders the view anew in place of the server's (D-047)
  await page.waitForFunction((field) => field?.isConnected === false, typedInto);
  await expect(search).toHaveValue("rav4");
  await expect(search).toBeFocused();
  const caret = await search.evaluate((field: HTMLInputElement) => [field.selectionStart, field.selectionEnd]);
  expect(caret).toStrictEqual([2, 2]);
  await search.press("Enter");
  await expect(page).toHaveURL(/\/en\/cars\?q=rav4$/);
  await expectProblems(page, problems);
});

test("a control the keyboard reached before the page runs keeps the focus", async ({ page }) => {
  const problems = await watchProblems(page);
  const { run } = await openBeforeItRuns(page);
  const cars = page.getByRole("main").getByRole("link", { name: CATALOGS.en.nav.cars });
  await cars.focus();
  const reached = await cars.elementHandle();
  run();
  await page.waitForFunction((link) => link?.isConnected === false, reached);
  await expect(cars).toBeFocused();
  await expectProblems(page, problems);
});

/** The state of the crossing on show, and its start time: the scan line's in the stage of the view on show */
function shownCrossing(page: Page): Promise<{ playState: string; startTime: number | null } | null> {
  return page.evaluate(() => {
    // A page kept for a quick return stays in the document under display: none, without boxes
    const line = Array.from(document.querySelectorAll("#content line")).find(
      (element) => element.getClientRects().length > 0,
    );
    const [animation] = line?.getAnimations() ?? [];
    if (animation === undefined) return null;
    const { startTime } = animation;
    return { playState: animation.playState, startTime: typeof startTime === "number" ? startTime : null };
  });
}

test.describe("the stage's crossing, with motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("goes on across the swap after hydration, from where the server's page began it", async ({ page }) => {
    const problems = await watchProblems(page);
    const { run } = await openBeforeItRuns(page);
    await expect.poll(async () => (await shownCrossing(page))?.startTime ?? null).not.toBeNull();
    const served = await shownCrossing(page);
    const servedLine = await page.locator("#content line").elementHandle();
    run();
    await page.waitForFunction((line) => line?.isConnected === false, servedLine);
    expect((await shownCrossing(page))?.startTime).toBe(served?.startTime);
    await expectProblems(page, problems);
  });

  test("crosses again on a later visit to the same page", async ({ page }) => {
    const problems = await watchProblems(page);
    await page.goto("/en/dev/shell");
    /** Opens the unbuilt page, waits for its crossing to end, and gives the crossing's start time */
    const visit = async () => {
      await page.getByRole("link", { name: "An unbuilt page" }).click();
      await expect(page).toHaveURL(/\/en\/cars$/);
      await expect.poll(async () => (await shownCrossing(page))?.playState).toBe("finished");
      return (await shownCrossing(page))?.startTime ?? Number.NaN;
    };
    const first = await visit();
    await page.goBack();
    // The second crossing begins with the second visit, not with the first
    expect(await visit()).toBeGreaterThan(first);
    await expectProblems(page, problems);
  });
});

// A page whose subject isn't there, as a car that has gone, gets not-found.tsx's title as its metadata
// finds nothing: in the server's page, and once the page runs, as not-found.tsx renders its view
for (const locale of ["ar", "en"] as const) {
  test(`a page whose metadata finds nothing has the 404's title in ${locale}`, async ({ page }) => {
    const problems = await watchProblems(page);
    const { response, run } = await openBeforeItRuns(page, `/${locale}/dev/shell/gone`);
    expect(response?.status()).toBe(404);
    await expect(page).toHaveTitle(new RegExp(`^${CATALOGS[locale].errors.notFound.title} · `));
    const served = await page.getByRole("heading", { level: 1 }).elementHandle();
    run();
    await page.waitForFunction((heading) => heading?.isConnected === false, served);
    await expectNotFoundView(page, locale);
    await expectProblems(page, problems);
  });
}

test("a link to an unknown page shows the view, and its heading takes the focus", async ({ page }) => {
  const problems = await watchProblems(page);
  await page.goto("/en/dev/shell");
  await page.getByRole("link", { name: "An unbuilt page" }).click();
  await expect(page).toHaveURL(/\/en\/cars$/);
  await expectNotFoundView(page, "en");
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await expectProblems(page, problems);
});
