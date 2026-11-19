import { expect, type Locator, type Page, test } from "@playwright/test";
import { CarFixtures, seedCar } from "../support/car-fixture.ts";
import { CATALOGS } from "../support/catalogs.ts";
import { DESKTOP_FROM, hydrated } from "../support/e2e-page.ts";
import { EIGHTEEN } from "../support/fixture-photos.ts";

// The car page under two of DESIGN §10.2's preferences. Under forced colours the browser draws
// every colour from the system's few, drops fills and gradients, and paints a backplate behind
// each line's text, as tall as its font's ascent and descent (DESIGN §8.8); under increased
// contrast surfaces gain an edge (DESIGN §4.5). A test runs where the browser applies the
// preference it emulates, and a test of what forcing colours does where the browser forces them:
// WebKit matches the query of forced colours but paints as ever.

const LOCALES = ["ar", "en"] as const;
type Locale = (typeof LOCALES)[number];
const OTHER: Record<Locale, Locale> = { ar: "en", en: "ar" };

const FORCED_COLOURS = { media: { forcedColors: "active" }, query: "(forced-colors: active)" } as const;
const MORE_CONTRAST = { media: { contrast: "more" }, query: "(prefers-contrast: more)" } as const;
type Preference = typeof FORCED_COLOURS | typeof MORE_CONTRAST;

const fixtures = new CarFixtures();
test.afterEach(() => fixtures.remove());

/** Opens a page under the preference, and skips the test in a browser that doesn't apply it */
async function openUnder(page: Page, { media, query }: Preference, locale: Locale, path: string) {
  await page.emulateMedia(media);
  await page.goto(`/${locale}${path}`);
  await hydrated(page, locale);
  test.skip(!(await page.evaluate((condition) => matchMedia(condition).matches, query)), `no ${query} here`);
}

/** Whether the browser forces the page's colours: an author's colour it computes as the system's */
const forcesColours = (page: Page) =>
  page.evaluate(() => {
    const probe = document.body.appendChild(document.createElement("i"));
    probe.style.color = "rgb(1, 2, 3)";
    const forced = getComputedStyle(probe).color !== "rgb(1, 2, 3)";
    probe.remove();
    return forced;
  });

/** Opens a page under forced colours, and skips the test in a browser that doesn't force them */
async function openForcing(page: Page, locale: Locale, path: string) {
  await openUnder(page, FORCED_COLOURS, locale, path);
  test.skip(!(await forcesColours(page)), "the browser matches (forced-colors: active) and forces no colour");
}

const carPath = (slug: string) => `/cars/${slug}`;

/** An outline round the box, drawn inside it: the edge a surface gains (the surface-edge utility) */
const expectEdged = (surface: Locator) => expect(surface).toHaveCSS("outline-style", "solid");

for (const locale of LOCALES) {
  test(`under forced colours, no line of a car's title reaches the next one's text, in ${locale}`, async ({ page }) => {
    await openForcing(page, locale, carPath((await seedCar("s01")).slug));
    // Each line's text as its backplate covers it: the font's ascent and descent, which reach past a
    // line box set tighter than they are
    const lines = await page.locator("h1").evaluate((title) =>
      [...title.children].map((line) => {
        const text = document.createRange();
        text.selectNodeContents(line);
        const { top, bottom } = text.getBoundingClientRect();
        return { top, bottom };
      }),
    );
    // The year and the make, the model name and the trim
    expect(lines).toHaveLength(3);
    for (const [above, below] of lines.slice(1).map((line, at) => [lines[at], line] as const)) {
      expect(below?.top).toBeGreaterThanOrEqual(above?.bottom ?? Infinity);
    }
  });
}

/** The steps that take the font's own line height under forced colours, by script (DESIGN §3.3) */
const OWN_LEADING: Record<Locale, string[]> = {
  ar: ["type-display", "wordmark"],
  en: ["type-display", "type-head", "type-subhead", "wordmark"],
};

/**
 * Each type step's line box and text box, and whether it takes the font's own line height, in a
 * sample in the page's language, or in a phrase that sets its own lang, as one in the other
 * language does (DESIGN §8.7). page.evaluate sends it to the page as source text.
 */
const typeSteps = (page: Page, phrase: Locale | null) =>
  page.evaluate(
    (lang) =>
      ["type-display", "type-head", "type-subhead", "type-lead", "type-body", "type-small", "wordmark"].map((step) => {
        const sample = document.querySelector("main")?.appendChild(document.createElement("span"));
        if (sample === undefined) throw new Error("The page has no main");
        if (lang !== null) sample.lang = lang;
        sample.className = `block ${step}`;
        sample.textContent = (lang ?? document.documentElement.lang) === "ar" ? "لاندكروزر" : "Hxgy";
        const text = document.createRange();
        text.selectNodeContents(sample);
        const sizes = {
          step,
          line: sample.getBoundingClientRect().height,
          text: text.getBoundingClientRect().height,
          own: getComputedStyle(sample).lineHeight === "normal",
        };
        sample.remove();
        return sizes;
      }),
    phrase,
  );

test("under forced colours, each type step's line box holds its text, in both scripts (DESIGN §3.3)", async ({
  page,
}) => {
  for (const locale of LOCALES) {
    await openForcing(page, locale, carPath((await seedCar("s01")).slug));
    for (const [lang, phrase] of [
      [locale, null],
      [OTHER[locale], OTHER[locale]],
    ] as const) {
      const steps = await typeSteps(page, phrase);
      const where = `${lang} on /${locale}`;
      for (const { step, line, text } of steps) expect(text, `${step} in ${where}`).toBeLessThanOrEqual(line);
      // The font's own line height where a step's own is tighter than its text, and only there
      expect(
        steps.filter(({ own }) => own).map(({ step }) => step),
        where,
      ).toStrictEqual(OWN_LEADING[lang]);
    }
  }
});

for (const [name, preference] of [
  ["forced colours", FORCED_COLOURS],
  ["increased contrast", MORE_CONTRAST],
] as const) {
  test(`under ${name}, a car page's surfaces keep an edge (DESIGN §4.5 and §8.8)`, async ({ page, viewport }) => {
    const { car, card } = CATALOGS.en;
    await openUnder(page, preference, "en", carPath((await seedCar("s16")).slug));
    // The key facts stand on the page's ground between a rule above and one below, as a table's
    // (D-049): no fill to lose, so no edge, and both rules still drawn. Forced colours give a
    // transparent ground the system's colour and keep its alpha. A rule is read by its width, as
    // Tailwind's base styles make every element's border style solid.
    const facts = page.locator("main dl");
    expect(await facts.evaluate((list) => getComputedStyle(list).backgroundColor)).toMatch(
      /^(rgba\(\d+, \d+, \d+, 0\)|transparent)$/,
    );
    const rules = facts.locator("xpath=../..");
    await expect(rules).toHaveCSS("border-top-width", "1px");
    await expect(rules).toHaveCSS("border-bottom-width", "1px");
    // A car without photos: the quiet frame in the stage's shape
    await expectEdged(page.locator("[data-gallery-column] > div"));
    await expectEdged(page.getByText(car.reserved, { exact: true }));

    await page.goto(`/en${carPath(await fixtures.copy("s20", "sold"))}`);
    await expectEdged(page.getByText(car.sold, { exact: true }));

    const { priceJod } = await seedCar("s01");
    const drop = { fromJod: (priceJod ?? 0) + 2000, daysAgo: 3 };
    await page.goto(`/en${carPath(await fixtures.copy("s01", "published", { drop }))}`);
    await expectEdged(page.getByText(card.priceDropped, { exact: true }));

    const battery = { batterySohPct: 91, batterySohSource: "diagnostic_scan" } as const;
    await page.goto(`/en${carPath(await fixtures.copy("s02", "published", { changes: battery }))}`);
    // The battery's bar and its fill, which an edge keeps apart once their fills drop out
    const fill = page.locator("[aria-hidden=true] > [style*=inline-size]");
    await expectEdged(fill.locator(".."));
    await expectEdged(fill);

    const photos = EIGHTEEN.map((photo, at) => (at === 1 ? { ...photo, broken: true } : photo));
    await page.goto(`/en${carPath(await fixtures.copy("s01", "published", { photos }))}`);
    await hydrated(page, "en");
    // The --bg capsule of a phone's count and full screen button, over its photo. From 1024 px no
    // capsule: the button stands beside the rail on a border of its own.
    const capsule = page.getByRole("button", { name: car.gallery.fullscreen, exact: true }).locator("..");
    if ((viewport?.width ?? 0) < DESKTOP_FROM) {
      await expectEdged(capsule);
      return;
    }
    await expect(capsule).toHaveCSS("outline-style", "none");
    // The rail's tile of a photo whose file is missing, and the capsule of "+N" on the tile of the
    // photos past its six, which shows the seventh photo as a thumbnail does (D-049)
    const missing = page.locator("[data-thumbnail] button").nth(1);
    await expect(missing.getByRole("img")).toHaveCount(0);
    await expectEdged(missing.locator("> span"));
    const more = page.getByRole("button").filter({ hasText: /^\+\d+$/ });
    await expectEdged(more.locator("> span"));
  });
}

test("under forced colours, a reserved car's band keeps its hatch (DESIGN §3.5 and §8.8)", async ({ page }) => {
  await openForcing(page, "en", carPath((await seedCar("s16")).slug));
  const words = page.getByText(CATALOGS.en.car.reserved, { exact: true });
  const band = words.locator("..");
  await expect(band).not.toHaveCSS("background-image", "none");
  // Its lines in the system's text colour whatever colour a place gives them, and its words in the
  // system's colours, as the page's are
  await band.evaluate((node) => node.style.setProperty("--hatch-color", "rgb(1, 2, 3)"));
  await expect(band).toHaveCSS("background-image", /^repeating-linear-gradient/);
  await expect(band).not.toHaveCSS("background-image", /rgb\(1, 2, 3\)/);
  await expect(words).toHaveCSS("color", await page.evaluate(() => getComputedStyle(document.body).color));
});

test("under forced colours, the rail marks the photo in view (FR-10.1)", async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < DESKTOP_FROM, "the rail shows from 1024 px");
  await openUnder(page, FORCED_COLOURS, "en", carPath(await fixtures.copy("s01", "published", { photos: EIGHTEEN })));
  // Every border takes the system's colour there, so the one in view gains a second frame
  const thumbnails = page.locator("[data-thumbnail] button");
  await expect(thumbnails.first()).toHaveCSS("outline-style", "solid");
  await expect(thumbnails.nth(1)).toHaveCSS("outline-style", "none");
  // Picked with the keyboard, the one in view shows the focus ring instead, outside its border
  const second = thumbnails.nth(1);
  await second.focus();
  await page.keyboard.press("Enter");
  await expect(second).toHaveAttribute("aria-current", "true");
  expect(await second.evaluate((thumbnail) => thumbnail.matches(":focus-visible"))).toBe(true);
  const ring = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--focus-ring-offset").trim(),
  );
  await expect(second).toHaveCSS("outline-offset", ring);
});
