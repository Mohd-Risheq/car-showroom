import { type APIResponse, expect, type Locator, type Page, test } from "@playwright/test";
import { similarCarsPath } from "../../src/features/car-page/domain/similar.ts";
import { SLUG_MAX_LENGTH } from "../../src/features/dealer/domain/slug.ts";
import { blobStoreHost, publicPolicy, securityHeaders } from "../../src/lib/csp/policy.ts";
import { FEATURE_GROUPS, type FeatureKey } from "../../src/lib/db/feature-keys.ts";
import { FEATURE_LABELS } from "../../src/lib/db/feature-labels.ts";
import { INTL_LOCALE } from "../../src/lib/i18n/intl-locale.ts";
import { otherLocale } from "../../src/lib/i18n/locales.ts";
import { seriousA11yIssues } from "../support/axe.ts";
import { openBeforeItRuns } from "../support/before-it-runs.ts";
import { CarFixtures, seedCar } from "../support/car-fixture.ts";
import { CATALOGS } from "../support/catalogs.ts";
import { copyOnShare, DESKTOP_FROM, hydrated, privacyLink, QUIET, tabKey, watchBeacons } from "../support/e2e-page.ts";
import { atEachWidth, iconSizes, REFLOW_WIDTHS, sideways } from "../support/layout.ts";
import { LEFT_TO_RIGHT_MARK, NO_BREAK_SPACE } from "../support/marks.ts";
import { expectProblems, watchProblems } from "../support/page-problems.ts";
import { serverSetting } from "../support/server-env.ts";

// SCR-03's car page at its slug (FR-09.1, FR-09.2, SRS §11.4): every response has its true status
// from its first request on, with the public site's headers. A public car's page is a 200 under the
// car's title, an earlier slug a permanent redirect to the car's slug now, and a slug no public car
// has the 404, titled that the car is no longer listed where the site showed it, whose view keeps
// its controls and the words typed into it once the page runs (D-047). A sold car's page stays out
// of search engines. The title block (DESIGN §7.2.3) shows a reserved or sold car's band above the
// title, a sold car's price struck through with its way on to similar cars (FR-09.9), the price's
// notes (BR-05, BR-45), and Share, which shares or copies the car's address (FR-09.11), as the
// Share at the page's end does (Region J), and says so where it can do neither. The key facts
// follow, each under its label and none empty, their words whole on a phone (FR-09.3), then the
// mileage check that opens to its rule (FR-09.4), battery health (FR-09.5) and the agency warranty,
// and further down the features by group and the description, in the other language where the
// page's is missing (BR-28), each in its section with its anchor, from 1440 px beside its heading.
// Below 1024 px the action bar holds the price at the bottom of the screen, and a sold car's way on
// (FR-02.2); it holds nothing on the page a link leads on to, where the car page stays hidden for
// the way back. From 1024 px the gallery's column holds below the header while the title's goes by
// (SCR-03). And the page as a whole: its skip link (TC-02-1), no sideways scroll from 320 to 1440
// px, its language switch to the car's page in the other language (FR-01.4), the focus and the
// place a step back comes back to (FR-02.4, FR-02.5), icons of 20 or 24 px (DESIGN §3.6), its
// figures and its lead (D-049), and no serious axe issue on a car on sale, reserved or sold
// (NFR-A11Y-04).

type FeatureGroup = keyof typeof FEATURE_GROUPS;
const LOCALES = ["ar", "en"] as const;

declare global {
  interface Window {
    /** What the page gave the share sheet, in order */
    shared: ShareData[];
  }
}

/** FR-09.3's key facts, in its order, for a car that has them all, as s01 does */
const FACT_FIELDS = [
  "km",
  "year",
  "fuel",
  "transmission",
  "regionalSpecs",
  "customs",
  "licenceUntil",
  "insurance",
  "owners",
  "seats",
  "engineSize",
  "drivetrain",
  "exteriorColour",
  "interiorColour",
] as const;

const fixtures = new CarFixtures();
test.afterEach(() => fixtures.remove());

/** The text, escaped for a pattern */
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A pattern for text that starts with the text given */
const startingWith = (text: string) => new RegExp(`^${escaped(text)}`);

/** A pattern for the whole of a message, any text in each value's place */
const messagePattern = (message: string) => new RegExp(`^${escaped(message).replace(/\\\{\w+\\\}/g, ".+")}$`);

/** A price's figures as the page writes them (BR-02) */
const figures = (priceJod: number, locale: "ar" | "en") => new Intl.NumberFormat(INTL_LOCALE[locale]).format(priceJod);

/** The page's canonical address, on the site's origin (SRS §15.1) */
function canonical(path: string): string {
  return new URL(path, serverSetting("NEXT_PUBLIC_SITE_URL")).href;
}

/** The page's Share buttons: the title block's first, then the one at the page's end (Region J) */
const shareButtons = (page: Page, locale: "ar" | "en") =>
  page.getByRole("button", { name: CATALOGS[locale].car.share, exact: true });

/** Asks the server for the path without following a redirect */
const ask = (page: Page, path: string) => page.request.get(path, { maxRedirects: 0 });

/**
 * Expects the public site's headers: its Content Security Policy, the one without a nonce that lets
 * a public page be cached (SRS §12.5), and SEC-15's
 */
function expectPublicHeaders(response: APIResponse) {
  const headers = response.headers();
  const policy = publicPolicy({ store: blobStoreHost(process.env.BLOB_STORE_HOST) });
  expect(headers["content-security-policy"], "Content-Security-Policy").toBe(policy);
  for (const { key, value } of securityHeaders("public")) expect(headers[key.toLowerCase()], key).toBe(value);
}

/** What the page's robots tags say */
const robots = (page: Page) =>
  page.locator("meta[name=robots]").evaluateAll((tags) => tags.map((tag) => tag.getAttribute("content") ?? ""));

/**
 * What the robots tags in a page's HTML say, as the server sent it: what a crawler reads without
 * running the page. A 404's come from the server, and once more from the browser as the page runs.
 */
const robotsIn = (html: string) =>
  Array.from(
    html.matchAll(/<meta\b[^>]*\bname="robots"[^>]*>/g),
    ([tag]) => /\bcontent="([^"]*)"/.exec(tag)?.[1] ?? "",
  );

/** Expects robots tags that keep a page out of search engines: one at least, and each says noindex */
function expectNoindex(said: string[]) {
  expect(said.length, "robots tags").toBeGreaterThan(0);
  for (const content of said) expect(content).toMatch(/noindex/);
}

/** The text of the h1 in a page's HTML, as the server sent it */
const headingIn = (html: string) => /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1]?.replace(/<[^>]*>/g, "") ?? "";

for (const locale of LOCALES) {
  test(`a public car's page answers 200 under the car's title in ${locale}`, async ({ page }) => {
    const { slug, title } = await seedCar("s01");
    const response = await ask(page, `/${locale}/cars/${slug}`);
    expect(response.status()).toBe(200);
    expectPublicHeaders(response);
    expect(robotsIn(await response.text())).toStrictEqual([]);
    const problems = await watchProblems(page);
    await page.goto(`/${locale}/cars/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title[locale]);
    await expect(page).toHaveTitle(startingWith(`${title[locale]} · `));
    await hydrated(page, locale);
    expect(await robots(page)).toStrictEqual([]);
    await expectProblems(page, problems);
  });
}

test("a car published after the build answers 200 on its first request, with the car's page", async ({ page }) => {
  const slug = await fixtures.copy("s01", "published");
  const { title } = await seedCar("s01");
  const response = await ask(page, `/en/cars/${slug}`);
  expect(response.status()).toBe(200);
  expectPublicHeaders(response);
  expect(headingIn(await response.text())).toBe(title.en);
  await page.goto(`/en/cars/${slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title.en);
});

for (const locale of LOCALES) {
  test(`a sold car's page answers 200 in ${locale}, out of search engines`, async ({ page }) => {
    const slug = await fixtures.copy("s11", "sold");
    const response = await ask(page, `/${locale}/cars/${slug}`);
    expect(response.status()).toBe(200);
    expectPublicHeaders(response);
    expectNoindex(robotsIn(await response.text()));
    const problems = await watchProblems(page);
    await page.goto(`/${locale}/cars/${slug}`);
    await hydrated(page, locale);
    expectNoindex(await robots(page));
    await expectProblems(page, problems);
  });
}

for (const locale of LOCALES) {
  test(`an earlier slug redirects for good to the car's slug now in ${locale}, from the first request (TC-09-2)`, async ({
    page,
  }) => {
    const { earlier, current } = await fixtures.earlierSlug("s01");
    const target = `/${locale}/cars/${current}`;
    for (const request of ["first", "second"]) {
      const response = await ask(page, `/${locale}/cars/${earlier}`);
      expect(response.status(), request).toBe(308);
      // Each response names the place once. Next.js named it twice in a page's first response, which
      // WebKit joins into one address that leads nowhere (Next.js issue #82117, patched: D-049)
      const places = response.headersArray().filter(({ name }) => name.toLowerCase() === "location");
      expect(places, request).toHaveLength(1);
      // On this site, with nothing after the path
      const place = new URL(places[0]?.value ?? "", response.url());
      expect(place.origin, request).toBe(new URL(response.url()).origin);
      expect(`${place.pathname}${place.search}${place.hash}`, request).toBe(target);
      expectPublicHeaders(response);
    }
    // A browser follows a first response too: another earlier slug's, which no request has asked for
    const { earlier: unasked } = await fixtures.earlierSlug("s01");
    const arrived = await page.goto(`/${locale}/cars/${unasked}`);
    expect(arrived?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(target);
  });
}

// Each a slug no public car has: one no car ever had, a draft's, and three no car can have, which the
// page answers without reading the database (car-page.test.ts). The slug in capitals is a copy's: on
// a disk that ignores case, as a Mac's does, next start's route cache keeps a slug and its capitals
// in one file, so a seed car's slug in capitals would replace that car's kept page (D-049).
const MISSES: readonly { name: string; slug: () => Promise<string> }[] = [
  { name: "a slug no car has", slug: async () => `e2e-${crypto.randomUUID().slice(0, 8)}-mu-2222` },
  { name: "a draft's slug", slug: async () => (await seedCar("s29")).slug },
  {
    name: "a public car's slug in capitals",
    slug: async () => (await fixtures.copy("s01", "published")).toUpperCase(),
  },
  { name: "a slug holding a NUL", slug: async () => `e2e-${crypto.randomUUID().slice(0, 8)}%00-mu-2222` },
  { name: "a slug longer than a car's can be", slug: async () => "a".repeat(SLUG_MAX_LENGTH + 1) },
];

for (const locale of LOCALES) {
  for (const { name, slug } of MISSES) {
    test(`${name} answers 404 under the 404's title in ${locale}`, async ({ page }) => {
      const path = `/${locale}/cars/${await slug()}`;
      const response = await ask(page, path);
      expect(response.status()).toBe(404);
      expectPublicHeaders(response);
      expectNoindex(robotsIn(await response.text()));
      const problems = await watchProblems(page);
      expect((await page.goto(path))?.status()).toBe(404);
      const { title } = CATALOGS[locale].errors.notFound;
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page).toHaveTitle(startingWith(`${title} · `));
      // The title and noindex stay once the page runs
      await hydrated(page, locale);
      await expect(page).toHaveTitle(startingWith(`${title} · `));
      expectNoindex(await robots(page));
      await expectProblems(page, problems);
    });
  }
}

for (const locale of LOCALES) {
  test(`a car the site showed answers 404 in ${locale}, titled that it is no longer listed`, async ({ page }) => {
    const path = `/${locale}/cars/${await fixtures.copy("s01", "archived")}`;
    const response = await ask(page, path);
    expect(response.status()).toBe(404);
    expectPublicHeaders(response);
    expectNoindex(robotsIn(await response.text()));
    const problems = await watchProblems(page);
    expect((await page.goto(path))?.status()).toBe(404);
    const title = startingWith(`${CATALOGS[locale].errors.carGone} · `);
    await expect(page).toHaveTitle(title);
    // The title and noindex stay once the page runs, and not-found.tsx renders its view
    await hydrated(page, locale);
    await expect(page).toHaveTitle(title);
    expectNoindex(await robots(page));
    expect(await seriousA11yIssues(page)).toStrictEqual([]);
    await expectProblems(page, problems);
  });
}

test.describe("the 404 of a car the site showed", () => {
  test("says the car is no longer listed and leads to similar cars, before and after the page runs", async ({
    page,
  }) => {
    const slug = await fixtures.copy("s01", "archived");
    const similar = similarCarsPath("en", (await seedCar("s01")).bodyType);
    const problems = await watchProblems(page);
    const { response, run } = await openBeforeItRuns(page, `/en/cars/${slug}`);
    expect(response?.status()).toBe(404);
    const heading = page.getByRole("heading", { level: 1 });
    const link = page.getByRole("main").getByRole("link", { name: CATALOGS.en.car.findSimilar });
    await expect(heading).toHaveText(CATALOGS.en.errors.carGone);
    await expect(link).toHaveAttribute("href", similar);
    // The keyboard reaches the link before the page runs, as on a slow phone
    await link.focus();
    const served = await link.elementHandle();
    run();
    // Once the page runs, not-found.tsx renders the view anew in place of the server's (D-047)
    await page.waitForFunction((element) => element?.isConnected === false, served);
    await expect(heading).toHaveText(CATALOGS.en.errors.carGone);
    await expect(link).toHaveAttribute("href", similar);
    await expect(link).toBeFocused();
    await expect(page.getByText(CATALOGS.en.errors.notFound.body)).toHaveCount(0);
    await expectProblems(page, problems);
  });

  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("the server's view leads there", async ({ page }) => {
      const slug = await fixtures.copy("s01", "archived");
      expect((await page.goto(`/ar/cars/${slug}`))?.status()).toBe(404);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(CATALOGS.ar.errors.carGone);
      await expect(page.getByRole("link", { name: CATALOGS.ar.car.findSimilar })).toHaveAttribute(
        "href",
        similarCarsPath("ar", (await seedCar("s01")).bodyType),
      );
    });
  });

  // not-found-focus.tsx gives the focus back by its place among the view's controls, so both views
  // must hold the same controls in the same order (D-047)
  for (const locale of LOCALES) {
    test(`holds the same controls in the same order once the page runs, the last keeping the focus, in ${locale}`, async ({
      page,
    }) => {
      const slug = await fixtures.copy("s01", "archived");
      const problems = await watchProblems(page);
      const { run } = await openBeforeItRuns(page, `/${locale}/cars/${slug}`);
      // Everything the server sent, read to its end
      await page.waitForFunction(() => document.readyState !== "loading");
      const main = page.getByRole("main");
      const controls = main.locator("a[href], button");
      const listed = () =>
        controls.evaluateAll((elements) =>
          elements.map((element) => [element.localName, element.getAttribute("href"), element.textContent?.trim()]),
        );
      const served = { controls: await listed(), tree: await main.ariaSnapshot() };
      await controls.last().focus();
      const reached = await controls.last().elementHandle();
      run();
      await page.waitForFunction((element) => element?.isConnected === false, reached);
      expect(await listed()).toStrictEqual(served.controls);
      await expect(main).toMatchAriaSnapshot(served.tree);
      await expect(controls.last()).toBeFocused();
      await expectProblems(page, problems);
    });
  }

  test("keeps words typed before the page runs in the search, with its focus and caret", async ({ page }) => {
    const slug = await fixtures.copy("s01", "archived");
    const problems = await watchProblems(page);
    const { run } = await openBeforeItRuns(page, `/en/cars/${slug}`);
    const search = page.getByRole("searchbox", { name: CATALOGS.en.nav.search });
    await search.fill("rav4");
    // The caret within the words, where the new field's own would not be
    await search.press("ArrowLeft");
    await search.press("ArrowLeft");
    const typedInto = await search.elementHandle();
    run();
    await page.waitForFunction((field) => field?.isConnected === false, typedInto);
    await expect(search).toHaveValue("rav4");
    await expect(search).toBeFocused();
    const caret = await search.evaluate((field: HTMLInputElement) => [field.selectionStart, field.selectionEnd]);
    expect(caret).toStrictEqual([2, 2]);
    await expectProblems(page, problems);
  });

  test("is the site's 404 for a slug no car had, after the page runs too", async ({ page }) => {
    const problems = await watchProblems(page);
    const { run } = await openBeforeItRuns(page, `/en/cars/e2e-${crypto.randomUUID().slice(0, 8)}-mu-2222`);
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toHaveText(CATALOGS.en.errors.notFound.title);
    const served = await heading.elementHandle();
    run();
    await page.waitForFunction((element) => element?.isConnected === false, served);
    await expect(heading).toHaveText(CATALOGS.en.errors.notFound.title);
    await expect(page.getByText(CATALOGS.en.errors.notFound.body)).toBeVisible();
    await expect(page.getByRole("link", { name: CATALOGS.en.car.findSimilar })).toHaveCount(0);
    await expectProblems(page, problems);
  });
});

test.describe("the title block", () => {
  for (const locale of LOCALES) {
    test(`shows a reserved car's band above the title in ${locale}`, async ({ page }) => {
      await page.goto(`/${locale}/cars/${(await seedCar("s16")).slug}`);
      const band = page.getByText(CATALOGS[locale].car.reserved);
      await expect(band).toBeVisible();
      const bandBox = await band.boundingBox();
      const titleBox = await page.getByRole("heading", { level: 1 }).boundingBox();
      expect(bandBox?.y).toBeLessThan(titleBox?.y ?? 0);
    });
  }

  for (const locale of LOCALES) {
    test(`shows a sold car as sold in ${locale}, with its price struck through (TC-09-4)`, async ({ page }) => {
      const { priceJod, bodyType } = await seedCar("s20");
      const slug = await fixtures.copy("s20", "sold");
      await page.goto(`/${locale}/cars/${slug}`);
      await expect(page.getByText(CATALOGS[locale].car.sold, { exact: true })).toBeVisible();
      // The title block's price, the page's only one: a sold car's bar holds its way on (D-049)
      const price = priceJod ?? 0;
      await expect(page.locator("s bdi")).toHaveText([figures(price, locale)]);
      // One line through the figures alone, in their face, at one height in every browser: a strike
      // of the whole price crossed figures and a unit of two sizes, which Chromium drew in three pieces
      await expect(page.locator("s")).toHaveCSS("text-decoration-line", "none");
      await expect(page.locator("s bdi")).toHaveCSS("text-decoration-line", "line-through");
      // From 1024 px the title block leads on to similar cars; a phone's action bar does (FR-09.9)
      const similar = similarCarsPath(locale, bodyType, price);
      const links = page.locator(`a[href="${similar}"]`);
      const [shown, hidden] = (page.viewportSize()?.width ?? 0) >= DESKTOP_FROM ? [0, 1] : [1, 0];
      await expect(links.nth(shown)).toBeVisible();
      await expect(links.nth(shown)).toHaveText(CATALOGS[locale].car.findSimilar);
      await expect(links.nth(hidden)).toBeHidden();
      await expect(links).toHaveCount(2);
    });
  }

  test("notes a price drop of the last 30 days, with the badge for its first 14 (BR-05)", async ({ page }) => {
    const { priceJod } = await seedCar("s01");
    const fromJod = (priceJod ?? 0) + 2000;
    const note = new RegExp(
      `^${escaped(CATALOGS.en.car.priceReduced)
        .replace("\\{old\\}", escaped(`${figures(fromJod, "en")}${NO_BREAK_SPACE}JOD`))
        .replace("\\{date\\}", "\\d{1,2} [A-Z][a-z]{2} \\d{4}")}$`,
    );
    const badge = page.getByText(CATALOGS.en.card.priceDropped, { exact: true });

    await page.goto(`/en/cars/${await fixtures.copy("s01", "published", { drop: { fromJod, daysAgo: 3 } })}`);
    await expect(page.getByText(note)).toBeVisible();
    await expect(badge).toBeVisible();

    await page.goto(`/en/cars/${await fixtures.copy("s01", "published", { drop: { fromJod, daysAgo: 20 } })}`);
    await expect(page.getByText(note)).toBeVisible();
    await expect(badge).toHaveCount(0);

    await page.goto(`/en/cars/${await fixtures.copy("s01", "published", { drop: { fromJod, daysAgo: 31 } })}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(note)).toHaveCount(0);
  });

  test("says a car's price is before customs while customs aren't paid (BR-45)", async ({ page }) => {
    // The title block's note, then the action bar's, which shows below 1024 px (FR-02.2)
    const note = page.getByText(CATALOGS.ar.car.priceBeforeCustoms);
    await page.goto(`/ar/cars/${(await seedCar("s28")).slug}`);
    await expect(note.first()).toBeVisible();
    await expect(note).toHaveCount(2);
    await page.goto(`/ar/cars/${(await seedCar("s01")).slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(note).toHaveCount(0);
  });

  for (const locale of LOCALES) {
    test(`hangs Share's icon at the column's edge, in line with the title above it, in ${locale}`, async ({ page }) => {
      await page.goto(`/${locale}/cars/${(await seedCar("s01")).slug}`);
      await hydrated(page, locale);
      const icon = await shareButtons(page, locale).first().locator("svg").boundingBox();
      const title = await page.getByRole("heading", { level: 1 }).boundingBox();
      // Where a line starts: on the right in Arabic
      const start = (box: { x: number; width: number } | null) =>
        locale === "ar" ? (box?.x ?? 0) + (box?.width ?? 0) : (box?.x ?? 0);
      expect(start(icon)).toBeCloseTo(start(title), 0);
    });
  }

  test("sets the year and make over the model name a step above the site's lead, 22 px on a 360 px phone and 26 px on a 1440 px screen (D-049)", async ({
    page,
  }) => {
    await page.goto(`/en/cars/${(await seedCar("s01")).slug}`);
    const lead = page.getByRole("heading", { level: 1 }).locator(".type-lead").first();
    for (const [width, size] of [
      [360, "22px"],
      [1440, "26px"],
    ] as const) {
      await page.setViewportSize({ width, height: 900 });
      expect(await lead.evaluate((line) => getComputedStyle(line).fontSize), `${width} px`).toBe(size);
    }
  });
});

/** The key facts' list, under its heading, which only screen readers get */
const keyFactsOf = (page: Page, locale: "ar" | "en") =>
  page
    .locator("section", { has: page.getByRole("heading", { level: 2, name: CATALOGS[locale].car.facts.title }) })
    .locator("dl");

/** The value the key facts give under the label */
const factUnder = (page: Page, locale: "ar" | "en", label: string) =>
  keyFactsOf(page, locale)
    .locator("dt")
    .filter({ hasText: new RegExp(`^${escaped(label)}$`) })
    .locator("xpath=following-sibling::dd[1]");

/** The section under the h2 */
const sectionOf = (page: Page, heading: string) =>
  page.locator("section", { has: page.getByRole("heading", { level: 2, name: heading }) });

/** The words of the element's text that a line break splits */
const brokenWords = (element: Locator) =>
  element.evaluate((root) => {
    const broken: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      // The isolates about a title's scripts, U+2066 to U+2069, are no words (FR-01.8, bidi.ts)
      for (const word of (node.textContent ?? "").matchAll(/[^\s\u2066-\u2069]+/g)) {
        const range = document.createRange();
        range.setStart(node, word.index);
        range.setEnd(node, word.index + word[0].length);
        if (new Set(Array.from(range.getClientRects(), (line) => Math.round(line.top))).size > 1) broken.push(word[0]);
      }
    }
    return broken;
  });

/** The mileage check's summary, whichever band it names */
const mileageCheckOf = (page: Page, locale: "ar" | "en") => {
  const { low, typical, high } = CATALOGS[locale].car.mileage;
  return page.locator("summary").filter({ hasText: new RegExp(`^(${[low, typical, high].map(escaped).join("|")})$`) });
};

test.describe("the key facts", () => {
  for (const locale of LOCALES) {
    test(`list each fact a car has under its label in ${locale}, none of them empty (TC-09-1)`, async ({ page }) => {
      const car = await seedCar("s01");
      await page.goto(`/${locale}/cars/${car.slug}`);
      const list = keyFactsOf(page, locale);
      await expect(list.locator("dt")).toHaveText(FACT_FIELDS.map((field) => CATALOGS[locale].field[field]));
      const values = await list.locator("dd").allTextContents();
      expect(values.filter((value) => value.trim() === "" || value.includes("N/A"))).toStrictEqual([]);
      await expect(factUnder(page, locale, CATALOGS[locale].field.km).locator("bdi")).toHaveText(
        figures(car.mileageKm ?? 0, locale),
      );
      // No seed car shows its VIN (BR-43)
      await expect(list.locator("dt").filter({ hasText: CATALOGS[locale].field.vin })).toHaveCount(0);
    });

    test(`keep their words whole on a 320 and a 360 px screen in ${locale}`, async ({ page }) => {
      await page.goto(`/${locale}/cars/${(await seedCar("s01")).slug}`);
      for (const width of [320, 360]) {
        await page.setViewportSize({ width, height: 780 });
        const list = keyFactsOf(page, locale);
        expect(await brokenWords(list), `${width} px`).toStrictEqual([]);
        expect(await list.evaluate((node) => node.scrollWidth - node.clientWidth), `${width} px`).toBe(0);
        expect(await sideways(page), `${width} px`).toBe(0);
      }
    });

    test(`name an electric car's engine as its electric motor in ${locale} (the owner, 2026-11-02)`, async ({
      page,
    }) => {
      await page.goto(`/${locale}/cars/${(await seedCar("s04")).slug}`);
      await expect(factUnder(page, locale, CATALOGS[locale].field.engineSize)).toHaveText(
        CATALOGS[locale].car.facts.electricMotor,
      );
    });
  }

  test("say a car without a licence isn't licensed", async ({ page }) => {
    await page.goto(`/en/cars/${(await seedCar("s28")).slug}`);
    await expect(factUnder(page, "en", CATALOGS.en.field.licence)).toHaveText(
      CATALOGS.en.enum.license_status.unlicensed,
    );
  });

  test("leave out the facts a car hasn't got", async ({ page }) => {
    const changes = {
      ownersCount: null,
      seats: null,
      engineCc: null,
      drivetrain: null,
      exteriorColorNameAr: null,
      exteriorColorNameEn: null,
      interiorColorNameAr: null,
      interiorColorNameEn: null,
    };
    await page.goto(`/en/cars/${await fixtures.copy("s01", "published", { changes })}`);
    // The facts up to the insurance are ones every public car has
    const kept = FACT_FIELDS.slice(0, FACT_FIELDS.indexOf("insurance") + 1);
    await expect(keyFactsOf(page, "en").locator("dt")).toHaveText(kept.map((field) => CATALOGS.en.field[field]));
  });
});

test("sets every figure on the page at seven eighths of the words around it, its capitals as tall as theirs (DESIGN §3.3, D-049)", async ({
  page,
}) => {
  await page.goto(`/ar/cars/${(await seedCar("s01")).slug}`);
  await hydrated(page, "ar");
  // Martian Mono's capitals stand 0.8 of its size and Readex Pro's 0.7: the price's figures, the
  // reference's, the key facts' and the photos' count, each against the words it stands in
  const ratios = await page.locator(".figures").evaluateAll((all) =>
    all.map((figures) => {
      const size = (element: Element) => Number.parseFloat(getComputedStyle(element).fontSize);
      return figures.parentElement === null ? 0 : size(figures) / size(figures.parentElement);
    }),
  );
  expect(ratios.length).toBeGreaterThanOrEqual(4);
  for (const ratio of ratios) expect(ratio).toBeCloseTo(0.875, 2);
});

test.describe("the mileage check", () => {
  for (const locale of LOCALES) {
    test(`names the band of a car's kilometres for its age, and opens to its rule in ${locale} (FR-09.4)`, async ({
      page,
    }) => {
      await page.goto(`/${locale}/cars/${(await seedCar("s01")).slug}`);
      const rule = page.getByText(messagePattern(CATALOGS[locale].car.mileage.info));
      await expect(rule).toBeHidden();
      await mileageCheckOf(page, locale).click();
      await expect(rule).toBeVisible();
    });
  }

  test("is left out for a new car, whose 0 km is still a fact (BR-06)", async ({ page }) => {
    const changes = { condition: "new", mileageKm: 0, ownersCount: null } as const;
    await page.goto(`/en/cars/${await fixtures.copy("s01", "published", { changes })}`);
    await expect(factUnder(page, "en", CATALOGS.en.field.km).locator("bdi")).toHaveText("0");
    await expect(mileageCheckOf(page, "en")).toHaveCount(0);
  });
});

test.describe("battery health", () => {
  for (const locale of LOCALES) {
    test(`shows a hybrid's battery at 91% with how it was measured in ${locale} (TC-09-5)`, async ({ page }) => {
      const changes = { batterySohPct: 91, batterySohSource: "diagnostic_scan" } as const;
      await page.goto(`/${locale}/cars/${await fixtures.copy("s02", "published", { changes })}`);
      const { car, enum: values } = CATALOGS[locale];
      // The figures carry a left-to-right mark, so their sign follows them in Arabic too (DESIGN §9.5)
      const health = page.getByText(car.battery.replace("{pct}", `${LEFT_TO_RIGHT_MARK}91`), { exact: true });
      await expect(health).toBeVisible();
      const source = car.batterySource.replace("{source}", values.soh_source.diagnostic_scan);
      await expect(page.getByText(source, { exact: true })).toBeVisible();
      const share = await page
        .locator("[aria-hidden=true] > [style*=inline-size]")
        .evaluate((bar) => bar.getBoundingClientRect().width / (bar.parentElement?.getBoundingClientRect().width ?? 0));
      expect(share).toBeCloseTo(0.91, 2);
      // 91%, never %91: the sign shows on the figures' right in both languages
      const { figuresEnd, signStart } = await health.locator(".figures").evaluate((digits) => {
        const range = document.createRange();
        range.selectNodeContents(digits.nextSibling ?? digits);
        return { figuresEnd: digits.getBoundingClientRect().right, signStart: range.getBoundingClientRect().left };
      });
      expect(signStart).toBeGreaterThanOrEqual(figuresEnd - 1);
    });
  }

  test("is left out for a hybrid whose dealer hasn't set it", async ({ page }) => {
    await page.goto(`/en/cars/${(await seedCar("s02")).slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(messagePattern(CATALOGS.en.car.battery))).toHaveCount(0);
  });
});

test("says until when a car's agency warranty runs", async ({ page }) => {
  const slug = await fixtures.copy("s01", "published", { changes: { warrantyUntil: "2030-05-01" } });
  for (const [locale, date] of [
    ["en", "1 May 2030"],
    ["ar", "1 أيار 2030"],
  ] as const) {
    await page.goto(`/${locale}/cars/${slug}`);
    await expect(page.getByText(CATALOGS[locale].car.warranty.replace("{date}", date), { exact: true })).toBeVisible();
  }
});

test.describe("the features", () => {
  for (const locale of LOCALES) {
    test(`list a car's features under their groups, in the catalog's order, in ${locale}`, async ({ page }) => {
      const car = await seedCar("s01");
      await page.goto(`/${locale}/cars/${car.slug}`);
      const groups = (Object.keys(FEATURE_GROUPS) as FeatureGroup[]).flatMap((group) => {
        const keys = (FEATURE_GROUPS[group] as readonly FeatureKey[]).filter((key) => car.features.includes(key));
        return keys.length === 0 ? [] : [{ group, labels: keys.map((key) => FEATURE_LABELS[key][locale]) }];
      });
      const section = sectionOf(page, CATALOGS[locale].car.features.title);
      await expect(section).toHaveAttribute("id", "features");
      await expect(section.getByRole("heading", { level: 3 })).toHaveText(
        groups.map(({ group }) => CATALOGS[locale].car.features[group]),
      );
      await expect(section.getByRole("listitem")).toHaveText(groups.flatMap(({ labels }) => labels));
    });
  }
});

test.describe("the description", () => {
  for (const locale of LOCALES) {
    test(`is the dealer's text in the page's language in ${locale}`, async ({ page }) => {
      await page.goto(`/${locale}/cars/${(await seedCar("s01")).slug}`);
      const section = sectionOf(page, CATALOGS[locale].car.description.title);
      await expect(section).toHaveAttribute("id", "description");
      await expect(section.locator(`p[lang=${locale}]`)).toBeVisible();
      await expect(section.getByText(CATALOGS[locale].car.description.onlyArabic)).toHaveCount(0);
      await expect(section.getByText(CATALOGS[locale].car.description.onlyEnglish)).toHaveCount(0);
    });
  }

  test("falls back to the other language's, marked as that language and labelled so (BR-28)", async ({ page }) => {
    await page.goto(`/en/cars/${await fixtures.copy("s01", "published", { changes: { descriptionEn: null } })}`);
    const section = sectionOf(page, CATALOGS.en.car.description.title);
    await expect(section.getByText(CATALOGS.en.car.description.onlyArabic, { exact: true })).toBeVisible();
    await expect(section.locator("p[lang=ar]")).toBeVisible();
    await expect(section.locator("p[lang=ar]")).toHaveAttribute("dir", "rtl");
  });

  test("is left out, as the features are, for a car without either", async ({ page }) => {
    const changes = { descriptionAr: null, descriptionEn: null, features: [] };
    await page.goto(`/ar/cars/${await fixtures.copy("s01", "published", { changes })}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: CATALOGS.ar.car.description.title })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2, name: CATALOGS.ar.car.features.title })).toHaveCount(0);
  });
});

/** Where the box starts and ends along a line, from the frame's start: from its right edge in Arabic */
async function along(frame: Locator, box: Locator, locale: "ar" | "en") {
  const [outer, inner] = [await frame.boundingBox(), await box.boundingBox()];
  if (outer === null || inner === null) throw new Error("A box isn't shown");
  return locale === "ar"
    ? { start: outer.x + outer.width - (inner.x + inner.width), end: outer.x + outer.width - inner.x }
    : { start: inner.x - outer.x, end: inner.x + inner.width - outer.x };
}

test.describe("the reading sections", () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) < 1440,
    "on a phone a section's heading stands over what it shows",
  );

  for (const locale of LOCALES) {
    test(`stand beside their headings from 1440 px, 4 columns of 12 in, with Share's row in line with them, in ${locale} (D-049)`, async ({
      page,
    }) => {
      await page.goto(`/${locale}/cars/${(await seedCar("s01")).slug}`);
      await hydrated(page, locale);
      const titles = [CATALOGS[locale].car.features.title, CATALOGS[locale].car.description.title];
      let wordsStart = Number.NaN;
      for (const title of titles) {
        const section = sectionOf(page, title);
        const { width, gap } = await section.evaluate((frame) => ({
          width: frame.getBoundingClientRect().width,
          gap: Number.parseFloat(getComputedStyle(frame).columnGap),
        }));
        const heading = await along(section, section.getByRole("heading", { level: 2 }), locale);
        const words = await along(section, section.locator("h2 + div"), locale);
        // The heading in the first 4 columns, what it shows in the other 8
        expect(heading.start, title).toBeCloseTo(0, 0);
        expect(words.start, title).toBeCloseTo((width + gap) / 3, 0);
        expect(words.end, title).toBeCloseTo(width, 0);
        wordsStart = words.start;
      }
      const description = sectionOf(page, CATALOGS[locale].car.description.title);
      expect((await along(description, shareButtons(page, locale).last(), locale)).start).toBeCloseTo(wordsStart, 0);
      // Below 1440 px each heading stands over what it shows, and Share's row at the page's start
      await page.setViewportSize({ width: 1366, height: 768 });
      for (const title of titles) {
        const section = sectionOf(page, title);
        const heading = await section.getByRole("heading", { level: 2 }).boundingBox();
        const words = await section.locator("h2 + div").boundingBox();
        expect((heading?.y ?? 0) + (heading?.height ?? 0), title).toBeLessThanOrEqual(words?.y ?? 0);
        expect((await along(section, section.locator("h2 + div"), locale)).start, title).toBeCloseTo(0, 0);
      }
      expect((await along(description, shareButtons(page, locale).last(), locale)).start).toBeCloseTo(0, 0);
    });
  }
});

// A car on sale, a reserved car with its band on the hatch, and a sold one with its band on
// --surface-3, its price struck through and its way on to similar cars
const AXE_CARS = [
  { state: "on sale", slug: async () => (await seedCar("s01")).slug },
  { state: "reserved", slug: async () => (await seedCar("s16")).slug },
  { state: "sold", slug: () => fixtures.copy("s20", "sold") },
] as const;

for (const locale of LOCALES) {
  for (const { state, slug } of AXE_CARS) {
    test(`a car's page has no serious axe issue in ${locale}, ${state}`, async ({ page }) => {
      await page.goto(`/${locale}/cars/${await slug()}`);
      await hydrated(page, locale);
      expect(await seriousA11yIssues(page)).toStrictEqual([]);
    });
  }
}

test.describe("Share", () => {
  test("copies the car's address where the browser has no share sheet, says so, and counts it", async ({ page }) => {
    const copied = await copyOnShare(page);
    const car = await seedCar("s01");
    const shares = watchBeacons(page, "share_native");
    const problems = await watchProblems(page);
    await page.goto(`/en/cars/${car.slug}`);
    await hydrated(page, "en");
    await shareButtons(page, "en").first().click();
    await expect(page.getByText(CATALOGS.en.car.linkCopied)).toBeVisible();
    expect(await copied()).toStrictEqual([canonical(`/en/cars/${car.slug}`)]);
    await expect.poll(shares).toStrictEqual([{ e: "share_native", c: car.id, l: "en" }]);
    await expectProblems(page, problems);
  });

  test("shares the car from the page's end as well, after its sections (DESIGN §7.2.3's Region J)", async ({
    page,
  }) => {
    const copied = await copyOnShare(page);
    const car = await seedCar("s01");
    const shares = watchBeacons(page, "share_native");
    await page.goto(`/ar/cars/${car.slug}`);
    await hydrated(page, "ar");
    await expect(shareButtons(page, "ar")).toHaveCount(2);
    const atTheEnd = shareButtons(page, "ar").last();
    // After the last of the car's sections and outside it, nearer to it than the sections are to
    // each other, so it reads as the page's end rather than the footer's start
    const place = await atTheEnd.evaluate((button) => {
      const sections = [...(button.closest("article")?.querySelectorAll("section") ?? [])];
      const [before, last] = sections.slice(-2).map((section) => section.getBoundingClientRect());
      const after = sections.at(-1)?.compareDocumentPosition(button) ?? 0;
      return {
        count: sections.length,
        after: (after & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 && (after & Node.DOCUMENT_POSITION_CONTAINED_BY) === 0,
        gap: (button.parentElement?.getBoundingClientRect().top ?? 0) - (last?.bottom ?? 0),
        sections: (last?.top ?? 0) - (before?.bottom ?? 0),
      };
    });
    expect(place.count).toBeGreaterThanOrEqual(2);
    expect(place.after).toBe(true);
    expect(place.gap).toBeCloseTo(64, 0);
    expect(place.gap).toBeLessThan(place.sections);
    // An outline button, where the title block's is quiet
    const border = (button: Locator) => button.evaluate((element) => getComputedStyle(element).borderTopWidth);
    expect(await border(atTheEnd)).toBe("1px");
    expect(await border(shareButtons(page, "ar").first())).toBe("0px");
    await atTheEnd.click();
    await expect(page.getByText(CATALOGS.ar.car.linkCopied)).toBeVisible();
    expect(await copied()).toStrictEqual([canonical(`/ar/cars/${car.slug}`)]);
    await expect.poll(shares).toStrictEqual([{ e: "share_native", c: car.id, l: "ar" }]);
  });

  test("opens the share sheet with the car's title and address where there is one, from either Share", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const shared: ShareData[] = [];
      Object.defineProperty(window, "shared", { value: shared });
      Object.defineProperty(Navigator.prototype, "canShare", { configurable: true, value: () => true });
      Object.defineProperty(Navigator.prototype, "share", {
        configurable: true,
        value: (data: ShareData) => {
          shared.push(data);
          return Promise.resolve();
        },
      });
    });
    const car = await seedCar("s01");
    const shares = watchBeacons(page, "share_native");
    await page.goto(`/ar/cars/${car.slug}`);
    await hydrated(page, "ar");
    // The title block's, then the page end's
    await shareButtons(page, "ar").first().click();
    await shareButtons(page, "ar").last().click();
    const share = { e: "share_native", c: car.id, l: "ar" };
    await expect.poll(shares).toStrictEqual([share, share]);
    const link = { title: car.title.ar, url: canonical(`/ar/cars/${car.slug}`) };
    expect(await page.evaluate(() => window.shared)).toStrictEqual([link, link]);
    await expect(page.getByText(CATALOGS.ar.car.linkCopied)).toHaveCount(0);
  });

  test("does nothing more when the visitor closes the sheet", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "share", {
        configurable: true,
        value: () => Promise.reject(new DOMException("The visitor closed the sheet", "AbortError")),
      });
    });
    const shares = watchBeacons(page, "share_native");
    const errors = watchBeacons(page, "client_error");
    const problems = await watchProblems(page);
    await page.goto(`/en/cars/${(await seedCar("s01")).slug}`);
    await hydrated(page, "en");
    await shareButtons(page, "en").first().click();
    await page.waitForTimeout(QUIET);
    expect(shares()).toStrictEqual([]);
    // A closed sheet is the visitor's choice, not a failure
    expect(errors()).toStrictEqual([]);
    await expect(page.getByText(CATALOGS.en.car.linkCopied)).toHaveCount(0);
    await expectProblems(page, problems);
  });

  test("copies the link where the sheet fails for another reason, and reports the sheet once (NFR-OBS-02)", async ({
    page,
  }) => {
    const copied = await copyOnShare(page);
    // A share sheet that refuses, where copyOnShare took it away
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "share", {
        configurable: true,
        value: () => Promise.reject(new DOMException("Not allowed", "NotAllowedError")),
      });
    });
    const car = await seedCar("s01");
    const shares = watchBeacons(page, "share_native");
    const errors = watchBeacons(page, "client_error");
    const problems = await watchProblems(page);
    await page.goto(`/en/cars/${car.slug}`);
    await hydrated(page, "en");
    // Both Share buttons copy the link, and the sheet's failure counts once a page
    for (const share of await shareButtons(page, "en").all()) await share.click();
    await expect(page.getByText(CATALOGS.en.car.linkCopied).first()).toBeVisible();
    const link = canonical(`/en/cars/${car.slug}`);
    await expect.poll(copied).toStrictEqual([link, link]);
    const share = { e: "share_native", c: car.id, l: "en" };
    await expect.poll(shares).toStrictEqual([share, share]);
    await page.waitForTimeout(QUIET);
    expect(errors()).toStrictEqual([{ e: "client_error", l: "en", r: "/[locale]/cars/[slug]", x: "SHARE_SHEET" }]);
    await expectProblems(page, problems);
  });

  test("says so where the link can be neither shared nor copied, and reports it once (NFR-OBS-02)", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "share", { configurable: true, value: undefined });
      Object.defineProperty(Navigator.prototype, "clipboard", {
        configurable: true,
        get: () => ({ writeText: () => Promise.reject(new DOMException("Not allowed", "NotAllowedError")) }),
      });
    });
    const shares = watchBeacons(page, "share_native");
    const errors = watchBeacons(page, "client_error");
    const problems = await watchProblems(page);
    await page.goto(`/en/cars/${(await seedCar("s01")).slug}`);
    await hydrated(page, "en");
    // Both Share buttons fail: the visitor is told each time, and the failure counts once a page
    for (const share of await shareButtons(page, "en").all()) await share.click();
    await expect(page.getByText(CATALOGS.en.errors.code.internal).first()).toBeVisible();
    await page.waitForTimeout(QUIET);
    expect(errors()).toStrictEqual([{ e: "client_error", l: "en", r: "/[locale]/cars/[slug]", x: "SHARE" }]);
    expect(shares()).toStrictEqual([]);
    await expect(page.getByText(CATALOGS.en.car.linkCopied)).toHaveCount(0);
    await expectProblems(page, problems);
  });
});

for (const locale of LOCALES) {
  test(`the first Tab reaches the skip link, which moves the focus to main, on sale or sold, in ${locale} (TC-02-1)`, async ({
    page,
    browserName,
  }) => {
    const skip = page.getByRole("link", { name: CATALOGS[locale].common.skip });
    for (const slug of [(await seedCar("s01")).slug, await fixtures.copy("s20", "sold")]) {
      await page.goto(`/${locale}/cars/${slug}`);
      // WebKit's Tab passes over links, as Safari's does unless the visitor asks
      await page.keyboard.press(tabKey(browserName));
      await expect(skip).toBeFocused();
      await expect(skip).toBeInViewport();
      await page.keyboard.press("Enter");
      await expect(page.locator("main")).toBeFocused();
    }
  });

  test(`never scrolls sideways, from 320 to 1440 px, on sale or sold, in ${locale} (WCAG 1.4.10)`, async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "the desktop projects try every width");
    // A sold car's price of seven figures before customs, the title block's longest
    const changes = { priceJod: 1_000_000, customsStatus: "not_cleared" } as const;
    for (const slug of [(await seedCar("s01")).slug, await fixtures.copy("s20", "sold", { changes })]) {
      await atEachWidth(page, `/${locale}/cars/${slug}`, REFLOW_WIDTHS, async (width) => {
        expect(await sideways(page), `${slug} at ${width} px`).toBe(0);
      });
    }
  });
}

test.describe("the language switch (FR-01.4)", () => {
  /** A car built with the site, one published since, and one the site showed that has gone */
  const cars = async () => [
    (await seedCar("s01")).slug,
    await fixtures.copy("s01", "published"),
    await fixtures.copy("s01", "archived"),
  ];

  for (const locale of LOCALES) {
    test(`in the header and the footer leads to the car's page in the other language, in ${locale}`, async ({
      page,
    }) => {
      const other = otherLocale(locale);
      for (const slug of await cars()) {
        await page.goto(`/${locale}/cars/${slug}`);
        await hydrated(page, locale);
        const switches = page.locator(`a[hreflang="${other}"]`);
        await expect(switches).toHaveCount(2);
        for (const link of await switches.all()) await expect(link).toHaveAttribute("href", `/${other}/cars/${slug}`);
      }
    });
  }

  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("leads there all the same, as the server knows the car's path", async ({ page }) => {
      for (const slug of await cars()) {
        for (const locale of LOCALES) {
          const other = otherLocale(locale);
          await page.goto(`/${locale}/cars/${slug}`);
          const switches = page.locator(`a[hreflang="${other}"]`);
          await expect(switches).toHaveCount(2);
          for (const link of await switches.all()) await expect(link).toHaveAttribute("href", `/${other}/cars/${slug}`);
        }
      }
    });
  });
});

test("a step back from a link at the page's end gives the link back its focus, at the place it was (FR-02.4, FR-02.5)", async ({
  page,
}) => {
  const { slug } = await seedCar("s01");
  for (const locale of LOCALES) {
    await page.goto(`/${locale}/cars/${slug}`);
    await hydrated(page, locale);
    const privacy = privacyLink(page, locale);
    // In view first, at once: focus() glides there as the page scrolls smoothly (FR-02.6), and the
    // place to come back to is where the glide ends
    await privacy.scrollIntoViewIfNeeded();
    await privacy.focus();
    const place = await page.evaluate(() => Math.round(window.scrollY));
    expect(place).toBeGreaterThan(0);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/${locale}/privacy$`));
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/${locale}/cars/${slug}$`));
    await expect(privacy).toBeFocused();
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(place);
  }
});

for (const locale of LOCALES) {
  test(`from 1024 px the gallery's column holds below the header while the title's goes by, in ${locale} (SCR-03)`, async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "the desktop projects try 1024 and 1440 px");
    const slug = await fixtures.copy("s01", "published", {
      photos: [{ group: "exterior" }, { group: "exterior" }, { group: "interior" }],
    });
    const column = page.locator("[data-gallery-column]");
    const title = page.getByRole("heading", { level: 1 });
    const header = page.locator("[data-site-header]");
    const top = async (element: Locator) => (await element.boundingBox())?.y ?? Number.NaN;
    // Where each column is with the page scrolled to the place given, at once rather than gliding
    const at = async (place: number) => {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), place);
      const box = await header.boundingBox();
      return { column: await top(column), title: await top(title), header: (box?.y ?? 0) + (box?.height ?? 0) };
    };
    // One visit, the window then widened: WebKit takes a second visit to the address back to the
    // place the first left
    await page.setViewportSize({ width: DESKTOP_FROM, height: 768 });
    await page.goto(`/${locale}/cars/${slug}`);
    await hydrated(page, locale);
    for (const size of [
      { width: DESKTOP_FROM, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(size);
      // At the page's top the stage starts 32 px under the header (§7.2.3)
      await expect
        .poll(async () => {
          const rest = await at(0);
          return rest.column - rest.header;
        })
        .toBeCloseTo(32, 0);
      // Region A, below which the sections take the page's width (§7.2.3), holds the column until the
      // end of the title's column, which runs on past it, carries it off: as far as that column runs
      // past the gallery's, about 400 px at 1440 by 900 for this car. So from 250 px to just before
      // that end, then on past it.
      const end = await column.evaluate((gallery) => {
        const held = Number.parseFloat(getComputedStyle(gallery).top);
        const titles = gallery.nextElementSibling?.getBoundingClientRect().bottom ?? Number.NaN;
        return Math.floor(window.scrollY + titles - held - gallery.getBoundingClientRect().height);
      });
      const [from, to] = [250, end - 10];
      expect(to - from, `${size.width} px`).toBeGreaterThanOrEqual(100);
      const [first, then, past] = [await at(from), await at(to), await at(end + 60)];
      expect(then.column, `${size.width} px`).toBeCloseTo(first.column, 0);
      expect(then.title, `${size.width} px`).toBeCloseTo(first.title - (to - from), 0);
      // Carried off with the title's column, by as far as the page went past the end
      expect(past.column, `${size.width} px`).toBeCloseTo(first.column - 60, -1);
      // Clear of the header, whose compact row reads 12 px shorter with nothing below it moving
      expect(first.column, `${size.width} px`).toBeGreaterThanOrEqual(first.header);
      // As far under the header's full height as at the page's top, so it holds without a jump
      const full = await header.evaluate((band: HTMLElement) => band.offsetHeight);
      expect(first.column, `${size.width} px`).toBeCloseTo(full + 32, 0);
      // At the start of the screen: the right in Arabic
      const [columnBox, titleBox] = [await column.boundingBox(), await title.boundingBox()];
      const atStart =
        locale === "ar" ? (columnBox?.x ?? 0) > (titleBox?.x ?? 0) : (columnBox?.x ?? 0) < (titleBox?.x ?? 0);
      expect(atStart, `${size.width} px`).toBe(true);
    }
  });
}

test("every icon on a car's page and in its fullscreen gallery is 20 or 24 px (DESIGN §3.6)", async ({ page }) => {
  await page.goto(
    `/en/cars/${await fixtures.copy("s01", "published", { photos: [{ group: "exterior" }, { group: "interior" }] })}`,
  );
  await hydrated(page, "en");
  const onPage = await iconSizes(page);
  expect(onPage.length).toBeGreaterThan(0);
  // Opened from the keyboard, the gallery shows at once, at its size (DESIGN §4.2)
  await page.locator("[data-photo]").first().getByRole("button").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  const inGallery = await iconSizes(page);
  expect(inGallery.length).toBeGreaterThan(onPage.length);
  for (const { name, width, height } of inGallery) {
    expect([20, 24], name).toContain(width);
    expect(height, name).toBe(width);
  }
});

test.describe("the action bar (FR-02.2)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= DESKTOP_FROM, "from 1024 px the title block holds the price");
  const bar = (page: Page) => page.locator("[data-action-bar]");
  const scrollPaddingBottom = (page: Page) =>
    page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom);
  test("holds the car's price at the bottom of the screen, with its customs note (BR-45)", async ({ page }) => {
    const notCleared = await seedCar("s28");
    await page.goto(`/ar/cars/${notCleared.slug}`);
    await expect(bar(page)).toBeInViewport();
    await expect(bar(page).locator("bdi")).toHaveText(figures(notCleared.priceJod ?? 0, "ar"));
    await expect(bar(page).getByText(CATALOGS.ar.car.priceBeforeCustoms, { exact: true })).toBeVisible();
    const box = await bar(page).boundingBox();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBe(page.viewportSize()?.height);

    const cleared = await seedCar("s01");
    await page.goto(`/ar/cars/${cleared.slug}`);
    await expect(bar(page).locator("bdi")).toHaveText(figures(cleared.priceJod ?? 0, "ar"));
    await expect(bar(page).getByText(CATALOGS.ar.car.priceBeforeCustoms)).toHaveCount(0);
  });

  for (const locale of LOCALES) {
    test(`holds a sold car's way on to similar cars alone, across its width, in ${locale} (FR-09.9, TC-09-4, D-049)`, async ({
      page,
    }) => {
      // The struck price is the title block's: beside it, the link ran off a 360 px phone. A price of
      // seven figures before customs, whose note went with the price, shows the same.
      const changes = { priceJod: 1_000_000, customsStatus: "not_cleared" } as const;
      const slug = await fixtures.copy("s20", "sold", { changes });
      const link = bar(page).getByRole("link", { name: CATALOGS[locale].car.findSimilar });
      // A small phone, the projects' phone, and a phone on its side, where the bar is 48 px tall
      for (const size of [
        { width: 320, height: 568 },
        { width: 360, height: 780 },
        { width: 844, height: 390 },
      ]) {
        await page.setViewportSize(size);
        await page.goto(`/${locale}/cars/${slug}`);
        await expect(link).toBeVisible();
        await expect(bar(page).locator("bdi")).toHaveCount(0);
        await expect(bar(page).getByText(CATALOGS[locale].car.priceBeforeCustoms)).toHaveCount(0);
        const fit = await bar(page).evaluate((element) => {
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const words = element.querySelector("a");
          return {
            start: box.left + parseFloat(style.paddingLeft),
            end: box.right - parseFloat(style.paddingRight),
            height: box.height,
            linkStart: words?.getBoundingClientRect().left,
            linkEnd: words?.getBoundingClientRect().right,
            wordsFit: words !== null && words.scrollWidth <= words.clientWidth,
          };
        });
        expect(fit.linkStart, `${size.width}`).toBeCloseTo(fit.start, 0);
        expect(fit.linkEnd, `${size.width}`).toBeCloseTo(fit.end, 0);
        expect(fit.wordsFit, `${size.width}`).toBe(true);
        expect(fit.height, `${size.width}`).toBe(size.height < 480 ? 48 : 64);
        // Nor does the title block's price push the page wider than the screen
        expect(await page.evaluate(() => document.documentElement.scrollWidth), `${size.width}`).toBe(size.width);
      }
    });
  }

  test("keeps Share's toast above it", async ({ page }) => {
    await copyOnShare(page);
    await page.goto(`/en/cars/${(await seedCar("s01")).slug}`);
    await hydrated(page, "en");
    await shareButtons(page, "en").first().click();
    const toast = page.locator("[data-sonner-toast]");
    await expect(toast).toBeVisible();
    const barTop = (await bar(page).boundingBox())?.y ?? 0;
    await expect
      .poll(async () => {
        const box = await toast.boundingBox();
        return (box?.y ?? 0) + (box?.height ?? 0);
      })
      .toBeLessThanOrEqual(barTop);
  });

  test("holds nothing on the page a link leads on to, and holds the bottom again on the way back", async ({ page }) => {
    await page.goto(`/en/cars/${(await seedCar("s01")).slug}`);
    await hydrated(page, "en");
    await expect(bar(page)).toBeVisible();
    const height = (await bar(page).boundingBox())?.height ?? 0;
    expect(await scrollPaddingBottom(page)).toBe(`${height}px`);

    await privacyLink(page, "en").click();
    await expect(page).toHaveURL(/\/en\/privacy$/);
    // The car page stays in the document, hidden, for the way back (Next.js's Activity)
    await expect(bar(page)).toHaveCount(1);
    await expect(bar(page)).toBeHidden();
    await expect.poll(() => scrollPaddingBottom(page)).toBe("0px");

    await page.goBack();
    await expect(bar(page)).toBeVisible();
    await expect.poll(() => scrollPaddingBottom(page)).toBe(`${height}px`);
  });

  test.describe("for a browser whose first language is English", () => {
    test.use({ locale: "en-US" });

    test("the English offer waits while it shows, and shows on the page a link leads on to (D-047)", async ({
      page,
    }) => {
      const offer = page.getByRole("region", { name: CATALOGS.ar.locale.prompt.text });
      await page.goto(`/ar/cars/${(await seedCar("s01")).slug}`);
      await hydrated(page, "ar");
      // Decided after hydration, the offer is on the page either way
      await expect(page.locator("[data-locale-prompt]")).toHaveCount(1);
      await expect(offer).toBeHidden();
      await privacyLink(page, "ar").click();
      await expect(page).toHaveURL(/\/ar\/privacy$/);
      await expect(offer).toBeVisible();
      await page.goBack();
      await expect(bar(page)).toBeVisible();
      await expect(offer).toBeHidden();
    });
  });
});
