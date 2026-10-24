import { readFileSync } from "node:fs";
import { type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";
import { seriousA11yIssues } from "../support/axe.ts";
import { inkOf, sideOf } from "../support/ink.ts";
import { watchProblems } from "../support/page-problems.ts";

// FR-01 in the browser: the root redirect and the English prompt (TC-01-1, BR-01, FR-01.2a), the
// language switch (FR-01.4), other locales' prefixes, DESIGN §9.5's formats written alike by the
// server and every engine (TC-01-4, BR-02, BR-03), and direction: typed text (NFR-I18N-04), mirrored
// arrows (FR-01.7) and long words (FR-01 edge cases), on /[locale]/dev/locale.

type Catalog = { locale: { prompt: { text: string; switch: string; stay: string } }; nav: { language: string } };
const catalog = (locale: "ar" | "en") => JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as Catalog;
const AR = catalog("ar");
const EN = catalog("en");

const DEV_PAGE = "/dev/locale";
const YEAR_IN_SECONDS = 365 * 24 * 60 * 60;
// --spacing-page, the page margin, from 16 px on a phone to 32 px, give or take a pixel's rounding
const MARGIN = { min: 15, max: 33 };
// DESIGN §8.4: all sticky chrome together, the prompt included, covers at most a quarter of the
// screen's height
const STICKY_BUDGET = 0.25;
const NO_BREAK_SPACE = String.fromCodePoint(0xa0);

/** The English prompt, a region named by its text */
const prompt = (page: Page) => page.getByRole("region", { name: AR.locale.prompt.text });

/** The request that has the server store the choice too, as Safari keeps the page's for 7 days (API-34) */
const choiceRequest = (page: Page) =>
  page.waitForRequest((request) => new URL(request.url()).pathname === "/api/locale" && request.method() === "POST");

/** Waits for the dev page to hydrate, which is when the prompt is decided */
async function hydrated(page: Page) {
  await expect(page.locator("tbody[data-hydrated=true]")).toHaveCount(1);
}

/** The visitor's stored choice of language, if any */
async function storedChoice(context: BrowserContext) {
  return (await context.cookies()).find(({ name }) => name === "NEXT_LOCALE");
}

/** Checks the stored choice and the cookie's attributes (FR-01.4) */
async function expectChoice(context: BrowserContext, locale: "ar" | "en", overHttps: boolean) {
  const cookie = await storedChoice(context);
  expect(cookie, "the NEXT_LOCALE cookie").toBeDefined();
  expect(cookie).toMatchObject({ value: locale, path: "/", sameSite: "Lax", httpOnly: false, secure: overHttps });
  // 365 days from now, give or take a test's length
  expect(Math.abs((cookie?.expires ?? 0) - (Date.now() / 1000 + YEAR_IN_SECONDS))).toBeLessThan(300);
}

test.describe("a browser whose first language is English", () => {
  test.use({ locale: "en-US" });

  test("lands on /ar from /, is offered English, and one tap opens /en and keeps that choice (TC-01-1)", async ({
    page,
    context,
    baseURL,
  }) => {
    const response = await page.goto("/");
    expect(new URL(page.url()).pathname).toBe("/ar");
    expect((await response?.request().redirectedFrom()?.response())?.status()).toBe(307);
    // Never stored by the redirect, which would end the offer (FR-01.2a)
    expect(await storedChoice(context)).toBeUndefined();

    await expect(prompt(page)).toBeVisible();
    const sent = choiceRequest(page);
    await prompt(page).getByRole("link", { name: AR.locale.prompt.switch }).click();
    expect((await sent).postDataJSON()).toStrictEqual({ locale: "en" });
    await page.waitForURL((url) => url.pathname === "/en");
    await expectChoice(context, "en", baseURL?.startsWith("https:") ?? false);

    // The next visit to / goes to the chosen language (BR-01)
    await page.goto("/");
    expect(new URL(page.url()).pathname).toBe("/en");
  });

  test("is offered English in a card that takes no focus, reads in two voices, and sits at the page's start", async ({
    page,
  }) => {
    await page.goto(`/ar${DEV_PAGE}`);
    const card = prompt(page);
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("lang", "en");
    await expect(card).toHaveAttribute("dir", "ltr");
    const stay = card.getByRole("button", { name: AR.locale.prompt.stay });
    await expect(stay).toHaveAttribute("lang", "ar");
    await expect(stay).toHaveAttribute("dir", "rtl");
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);

    // DESIGN §7.1.1: at most 320 px wide, with 44 px buttons, at the bottom start (the right, in
    // Arabic), within the page margins
    const viewport = page.viewportSize();
    const box = await card.boundingBox();
    if (viewport === null || box === null) throw new Error("no viewport or no card");
    const gaps = {
      start: viewport.width - (box.x + box.width),
      end: box.x,
      bottom: viewport.height - (box.y + box.height),
    };
    expect(box.width).toBeLessThanOrEqual(320);
    expect(box.height).toBeLessThanOrEqual(viewport.height * STICKY_BUDGET);
    expect(gaps.start).toBeLessThan(gaps.end);
    expect(gaps.start).toBeGreaterThanOrEqual(MARGIN.min);
    expect(gaps.start).toBeLessThanOrEqual(MARGIN.max);
    expect(gaps.end).toBeGreaterThanOrEqual(MARGIN.min);
    expect(gaps.bottom).toBeGreaterThanOrEqual(MARGIN.min);
    expect(gaps.bottom).toBeLessThanOrEqual(MARGIN.max);
    for (const control of [card.getByRole("link"), stay]) {
      expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
    expect(await seriousA11yIssues(page)).toStrictEqual([]);
  });

  test("keeps Arabic when asked: the card fades out and doesn't return", async ({ page, context, baseURL }) => {
    await page.goto(`/ar${DEV_PAGE}`);
    const sent = choiceRequest(page);
    await prompt(page).getByRole("button", { name: AR.locale.prompt.stay }).click();
    // The server stores it too, as Safari keeps the page's cookie for 7 days (API-34)
    const answer = await (await sent).response();
    expect(answer?.status()).toBe(204);
    // Two checks, as WebKit's Playwright breaks the header at the comma in its Expires date
    const cookie = await answer?.headerValue("set-cookie");
    expect(cookie).toMatch(/^NEXT_LOCALE=ar;/);
    expect(cookie).toContain("; Max-Age=31536000");
    // Still there to fade out, though the stored choice has ended the offer, then hidden
    await expect(page.locator("[data-dismissed]")).toHaveCount(1);
    await expect(prompt(page)).toBeHidden();
    await expectChoice(context, "ar", baseURL?.startsWith("https:") ?? false);

    await page.reload();
    await hydrated(page);
    await expect(prompt(page)).toHaveCount(0);
  });

  test("isn't offered English once a language is chosen", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL ?? "" }]);
    await page.goto(`/ar${DEV_PAGE}`);
    await hydrated(page);
    await expect(prompt(page)).toHaveCount(0);
  });

  // Playwright's Chromium runs without the back-forward cache, so each test fires its event
  for (const [event, when] of [
    ["visibilitychange", "the visitor comes back to this tab"],
    ["pageshow", "the page shows from the back-forward cache"],
  ] as const) {
    test(`isn't offered English any more once another tab has chosen a language, when ${when}`, async ({
      page,
      context,
      baseURL,
    }) => {
      await page.goto(`/ar${DEV_PAGE}`);
      await expect(prompt(page)).toBeVisible();
      await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL ?? "" }]);
      await page.evaluate((type) => {
        if (type === "pageshow") window.dispatchEvent(new PageTransitionEvent(type, { persisted: true }));
        else document.dispatchEvent(new Event(type));
      }, event);
      await expect(prompt(page)).toHaveCount(0);
    });
  }

  test("isn't offered English on an English page", async ({ page }) => {
    await page.goto(`/en${DEV_PAGE}`);
    await hydrated(page);
    await expect(prompt(page)).toHaveCount(0);
  });

  test.describe("on a phone held sideways", () => {
    // The phone projects' 360 by 780 phone, turned, which leaves the least height
    test.use({ viewport: { width: 780, height: 360 } });

    test("is offered English in a card within the sticky budget (DESIGN §8.4)", async ({ page }) => {
      await page.goto(`/ar${DEV_PAGE}`);
      await expect(prompt(page)).toBeVisible();
      const box = await prompt(page).boundingBox();
      if (box === null) throw new Error("no card");
      expect(box.height).toBeLessThanOrEqual(360 * STICKY_BUDGET);
    });
  });

  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("isn't offered English, as the page's HTML never holds the card", async ({ page }) => {
      await page.goto(`/ar${DEV_PAGE}`);
      await expect(prompt(page)).toHaveCount(0);
    });
  });
});

test.describe("a browser whose first language isn't English", () => {
  for (const locale of ["ar-JO", "fr-FR"]) {
    test.describe(locale, () => {
      test.use({ locale });

      test("lands on /ar from / and isn't offered English", async ({ page }) => {
        await page.goto("/");
        expect(new URL(page.url()).pathname).toBe("/ar");
        await page.goto(`/ar${DEV_PAGE}`);
        await hydrated(page);
        await expect(prompt(page)).toHaveCount(0);
      });
    });
  }
});

test("the language switch opens the same page in the other language, with its query, as a new document (FR-01.4)", async ({
  page,
  context,
  baseURL,
}) => {
  const problems = await watchProblems(page);
  const overHttps = baseURL?.startsWith("https:") ?? false;
  const query = "?fuel=hybrid&sort=price";
  await page.goto(`/ar${DEV_PAGE}${query}`);
  await hydrated(page);
  await page.evaluate(() => Object.assign(window, { sameDocument: true }));

  const english = page.getByRole("link", { name: AR.nav.language, exact: true });
  await expect(english).toHaveAttribute("href", `/en${DEV_PAGE}${query}`);
  await expect(english).toHaveAttribute("hreflang", "en");
  await expect(english).toHaveAttribute("lang", "en");
  await expect(english).toHaveAttribute("dir", "ltr");
  await english.click();
  await page.waitForURL((url) => url.pathname === `/en${DEV_PAGE}` && url.search === query);
  expect(await page.evaluate(() => "sameDocument" in window)).toBe(false);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expectChoice(context, "en", overHttps);

  await hydrated(page);
  const arabic = page.getByRole("link", { name: EN.nav.language, exact: true });
  await expect(arabic).toHaveAttribute("dir", "rtl");
  await arabic.click();
  await page.waitForURL((url) => url.pathname === `/ar${DEV_PAGE}` && url.search === query);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expectChoice(context, "ar", overHttps);
  expect(problems).toStrictEqual([]);
});

test("the language switch under a param the build doesn't know links to the same page once it runs (FR-01.4)", async ({
  page,
}) => {
  // The build prerendered this page's shell without its slug (src/app/.../dev/locale/[slug])
  await page.goto(`/ar${DEV_PAGE}/kia-sportage-2024?fuel=hybrid`);
  await expect(page.getByRole("link", { name: AR.nav.language, exact: true })).toHaveAttribute(
    "href",
    `/en${DEV_PAGE}/kia-sportage-2024?fuel=hybrid`,
  );
});

test("an unprefixed path keeps its query on the way to its language (FR-01.2)", async ({ page }) => {
  const redirect = await page.request.get("/cars?fuel=hybrid", { maxRedirects: 0 });
  expect(redirect.status()).toBe(307);
  const location = new URL(redirect.headers()["location"] ?? "", "http://localhost");
  expect(`${location.pathname}${location.search}`).toBe("/ar/cars?fuel=hybrid");
});

test("another locale's prefix is a 404 (FR-01's edge cases)", async ({ page, baseURL }) => {
  // Through the HTTPS front, Next.js fetches proxy.ts's rewrite from the server over HTTPS, which it
  // doesn't speak (tests/support/https-proxy.ts, D-041). On Vercel the rewrite should stay inside the
  // server, which T-37's first preview checks. page.request is Playwright's own client, so the other
  // projects ask the same server this.
  test.skip(baseURL?.startsWith("https:") ?? false, "the HTTPS front can't serve a rewrite in proxy.ts");
  for (const path of ["/fr/cars", "/fr", "/de-AT/cars"]) {
    expect((await page.request.get(path, { maxRedirects: 0 })).status(), path).toBe(404);
  }
});

// DESIGN §9.5, with the edges BR-02 and BR-03 meet: Amman's day after UTC's midnight, a negative number
const NUMBERS = {
  price: "14,500",
  "unit-price": "1.360",
  electricity: "0.108",
  "monthly-cost": "106",
  kilometres: "84,000",
  consumption: "6.8",
  time: "17:00",
  duration: "0:12",
  engine: "2.5",
  power: "203",
  microns: "240",
  dimensions: "4,950",
  percent: "91%",
  negative: "-14,500",
  phone: "+962 79 123 4567",
};
const SHOWN = {
  ar: {
    ...NUMBERS,
    date: "18 تشرين الأول 2026",
    "date-after-midnight": "18 تشرين الأول 2026",
    "calendar-date": "18 تشرين الأول 2026",
    "month-year": "آذار 2024",
  },
  en: {
    ...NUMBERS,
    date: "18 Oct 2026",
    "date-after-midnight": "18 Oct 2026",
    "calendar-date": "18 Oct 2026",
    "month-year": "Mar 2024",
  },
};

test.describe("in a browser whose time zone isn't the server's", () => {
  // West of UTC, where a date read in the browser's own zone would show the day before Amman's
  test.use({ timezoneId: "America/Los_Angeles" });

  for (const locale of ["ar", "en"] as const) {
    test(`/${locale} writes every format as the server does, in this engine (TC-01-4)`, async ({ page }) => {
      await page.goto(`/${locale}${DEV_PAGE}`);
      await hydrated(page);
      const rows = page.locator("tr[data-sample]");
      const written: Record<string, { server: string | null; browser: string | null }> = {};
      for (const row of await rows.all()) {
        const id = (await row.getAttribute("data-sample")) ?? "";
        written[id] = {
          server: await row.locator("[data-written=server]").textContent(),
          browser: await row.locator("[data-written=browser]").textContent(),
        };
      }
      const expected = Object.fromEntries(
        Object.entries(SHOWN[locale]).map(([id, text]) => [id, { server: text, browser: text }]),
      );
      expect(written).toStrictEqual(expected);
    });
  }
});

for (const locale of ["ar", "en"] as const) {
  test(`/${locale} reads a date in its language's direction, and a number left to right (DESIGN §9.4)`, async ({
    page,
  }) => {
    await page.goto(`/${locale}${DEV_PAGE}`);
    await hydrated(page);
    const directionOf = (sample: string) =>
      page
        .locator(`tr[data-sample=${sample}] [data-written=browser] bdi`)
        .evaluate((node) => getComputedStyle(node).direction);
    expect(await directionOf("date")).toBe(locale === "ar" ? "rtl" : "ltr");
    expect(await directionOf("month-year")).toBe(locale === "ar" ? "rtl" : "ltr");
    expect(await directionOf("negative")).toBe("ltr");
    expect(await directionOf("phone")).toBe("ltr");
  });

  test(`/${locale} shows a quantity with its unit on one line, spoken in full`, async ({ page }) => {
    await page.goto(`/${locale}${DEV_PAGE}`);
    const names =
      locale === "ar" ? { unit: "د.أ", spoken: "دينار أردني" } : { unit: "JOD", spoken: "Jordanian dinars" };
    const price = page.locator("[data-quantity=price]");
    expect(await price.textContent()).toBe(`14,500${NO_BREAK_SPACE}${names.unit}${names.spoken}`);
    await expect(price).toMatchAriaSnapshot(`- listitem: 14,500 ${names.spoken}`);
    expect(await price.locator("bdi").evaluate((number) => getComputedStyle(number).direction)).toBe("ltr");
  });
}

// Text typed into a field, and the side it reads from: that of its first letter (NFR-I18N-04)
const TYPED = [
  { text: "RAV4 تويوتا", side: "left" },
  { text: "تويوتا RAV4", side: "right" },
] as const;

/** A field's unicode-bidi, plaintext while it follows what is typed */
const unicodeBidiOf = (field: Locator) => field.evaluate((node) => getComputedStyle(node).unicodeBidi);

/** Types into a field and lets it go, so no focus ring shows */
async function type(field: Locator, text: string) {
  await field.fill(text);
  await field.blur();
}

for (const locale of ["ar", "en"] as const) {
  const start = locale === "ar" ? "right" : "left";

  test(`/${locale}: typed text reads from its first letter's side, and a placeholder from the page's start (NFR-I18N-04)`, async ({
    page,
  }) => {
    await page.goto(`/${locale}${DEV_PAGE}`);
    const search = page.locator("#free-text");
    // Not plaintext while the placeholder shows: Firefox draws no placeholder in plaintext
    expect(await unicodeBidiOf(search)).not.toBe("plaintext");
    expect(sideOf(await inkOf(search)), "the placeholder").toBe(start);
    for (const { text, side } of TYPED) {
      await type(search, text);
      expect(await unicodeBidiOf(search)).toBe("plaintext");
      expect(sideOf(await inkOf(search)), text).toBe(side);
    }
    await type(search, "");
    expect(await unicodeBidiOf(search)).not.toBe("plaintext");
    expect(sideOf(await inkOf(search)), "the placeholder, back").toBe(start);
  });

  test(`/${locale}: a field without a placeholder and a text area follow what is typed (NFR-I18N-04)`, async ({
    page,
  }) => {
    await page.goto(`/${locale}${DEV_PAGE}`);
    for (const field of [page.locator("#free-text-bare"), page.locator("#description")]) {
      expect(await unicodeBidiOf(field)).toBe("plaintext");
      for (const { text, side } of TYPED) {
        await type(field, text);
        expect(sideOf(await inkOf(field)), text).toBe(side);
      }
    }
  });

  test(`/${locale}: a VIN field reads left to right, whatever is typed (NFR-I18N-04)`, async ({ page }) => {
    await page.goto(`/${locale}${DEV_PAGE}`);
    const vin = page.locator("#vin");
    await expect(vin).toHaveAttribute("dir", "ltr");
    await type(vin, "تويوتا");
    expect(await unicodeBidiOf(vin)).not.toBe("plaintext");
    expect(sideOf(await inkOf(vin))).toBe("left");
  });

  test(`/${locale}: arrows along the line mirror in Arabic, and a play glyph doesn't (FR-01.7)`, async ({ page }) => {
    await page.goto(`/${locale}${DEV_PAGE}`);
    const scaleOf = (icon: string) =>
      page.locator(`[data-icon=${icon}]`).evaluate((node) => getComputedStyle(node).scale);
    const mirrored = locale === "ar" ? "-1 1" : "none";
    expect(await scaleOf("next")).toBe(mirrored);
    expect(await scaleOf("back")).toBe(mirrored);
    expect(await scaleOf("play")).toBe("none");
  });

  test(`/${locale}: a long Arabic word in a flex item of a narrow box wraps rather than overflows (FR-01 edge cases)`, async ({
    page,
  }) => {
    await page.goto(`/${locale}${DEV_PAGE}`);
    const box = page.locator("[data-long-word]");
    const { overflow, lines } = await box.evaluate((node) => {
      const text = document.createRange();
      text.selectNodeContents(node.querySelector("p") ?? node);
      const tops = new Set(Array.from(text.getClientRects(), (line) => Math.round(line.top)));
      return { overflow: node.scrollWidth - node.clientWidth, lines: tops.size };
    });
    // The word is wider than the box, so it breaks, and the item, which would grow to the word,
    // stays inside the box
    expect(lines).toBeGreaterThan(1);
    expect(overflow).toBe(0);
  });

  test(`/${locale}: a long word in a table stays whole, and the table scrolls in its frame`, async ({ page }) => {
    await page.goto(`/${locale}${DEV_PAGE}`);
    const frame = page.locator("[data-table-frame]");
    const { overflow, scroll, lines } = await frame.evaluate((node) => {
      const text = document.createRange();
      text.selectNodeContents(node.querySelector("td") ?? node);
      const tops = new Set(Array.from(text.getClientRects(), (line) => Math.round(line.top)));
      return {
        overflow: node.scrollWidth - node.clientWidth,
        scroll: getComputedStyle(node).overflowX,
        lines: tops.size,
      };
    });
    // A column sized below its longest word would break it a few letters a line
    expect(lines).toBe(1);
    // The table is wider than its frame, which scrolls it rather than letting it spill out: the
    // scroll width counts a spilled table too
    expect(overflow).toBeGreaterThan(0);
    expect(scroll).toBe("auto");
  });
}
