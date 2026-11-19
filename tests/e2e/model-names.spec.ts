import { expect, test } from "@playwright/test";
import { EARLY, NARROWEST_RATIO, SCROLL_BAR } from "../../scripts/checks/model-names.ts";
import { CarFixtures, seedCar } from "../support/car-fixture.ts";
import { DESKTOP_FROM } from "../support/e2e-page.ts";
import {
  BANDS,
  expectByRule,
  FOUR_TIMES_FROM,
  type NamesRead,
  openCar,
  readTitle,
  ROOM_SHARE,
  type Rule,
  ruleFor,
  rulesIn,
  screenHexp,
  SMALLER,
  within,
} from "../support/model-name-rule.ts";

// D-049's rule for a car title's model name (DESIGN §3.3), held in each browser to every model of the
// catalog: its words whole, and two lines wherever HEXP 0 holds two; HEXP 0 where model-names.css
// sets it and the step's HEXP elsewhere; the step's size, or a long name's cap. The list is measured
// in Chromium, so a browser that sets a word a little wider has only the margin, and has it least
// about each bound of a name's ranges. The test places the column there exactly: a car title's model
// name is a container whose bands follow its width as the ratios do, so a title set that wide at the
// step's largest size takes the ratio and the band the rule reads. A ratio under the desktop's
// narrowest takes a phone's own width, and a classic scroll bar's a phone's column made narrower.
// model-name-rule.ts gives each name's rule and reads the title.

const LOCALES = ["ar", "en"] as const;
type Locale = (typeof LOCALES)[number];

/** A desktop wide enough that the step is at its largest size, and the title can be set wider */
const DESKTOP = { width: 1920, height: 900 };
/** The narrowest ratio a desktop's title has, a hundred over the room share */
const DESKTOP_NARROWEST: Record<Locale, number> = { en: 100 / ROOM_SHARE.en, ar: 100 / ROOM_SHARE.ar };
/** A phone whose title can be set to any ratio under that at the step's smallest size, 56 px */
const PHONE = { width: 400, height: 900 };
/**
 * Where about each bound the column is placed, in px from it: across the pixel each side in eighths,
 * the name whole at each, and just outside, where its HEXP is the rule's
 */
const AROUND = [-1.05, ...Array.from({ length: 17 }, (_, index) => index / 8 - 1), 1.05];
/** Phone widths from 320 px, their English ratios from under the desktop's narrowest to past it */
const NARROW_PHONES = Array.from({ length: 16 }, (_, index) => 320 + index);
/**
 * Classic scroll bars' widths in px, which a screen's width counts and a title's column doesn't:
 * Windows', and a quarter of it at 400 % zoom (the owner, 2026-11-11)
 */
const SCROLL_BARS = [SCROLL_BAR, SCROLL_BAR / 4];

const RULES: Record<Locale, Rule[]> = { ar: rulesIn("ar"), en: rulesIn("en") };
/** The names the rule sets otherwise somewhere: in HEXP 0, or smaller */
const longIn = (locale: Locale) => RULES[locale].filter(({ ranges, cap }) => ranges.length > 0 || cap !== null);

test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, "the desktop projects place the title's column, and try the phones' widths");
});

for (const locale of LOCALES) {
  for (const rule of longIn(locale)) {
    test(`keeps ${rule.key} whole across each bound of its ranges in ${locale}, in two lines where HEXP 0 holds two`, async ({
      page,
    }) => {
      await page.setViewportSize(DESKTOP);
      await openCar(page, `/${locale}/cars/${(await seedCar("s02")).slug}`, [rule]);
      const bounds = rule.ranges.flatMap(({ from, to }) => [from, to]);
      for (const bound of bounds.filter((ratio) => ratio > NARROWEST_RATIO[locale])) {
        // Under the desktop's narrowest ratio, a phone's column that a classic scroll bar narrows
        await page.setViewportSize(bound < DESKTOP_NARROWEST[locale] ? PHONE : DESKTOP);
        // The step's size wherever the column has room, which makes a column's width a ratio
        const { usual } = await readTitle(page, [], 1000);
        for (const offset of AROUND) {
          const title = await readTitle(page, [rule], bound * usual + offset);
          const at = `${offset} px from ${bound.toFixed(4)}`;
          // The column has room for the step's size, so its width is the ratio's
          expect(title.usual, at).toBe(usual);
          const [read] = title.names;
          if (read === undefined) throw new Error("No name read");
          expectByRule(read, rule, title, at);
        }
      }
    });
  }

  test(`keeps each long name whole at the phones' widths under the desktop's narrowest ratio in ${locale}`, async ({
    page,
  }) => {
    const long = longIn(locale);
    await page.setViewportSize({ width: NARROW_PHONES[0] ?? 320, height: DESKTOP.height });
    await openCar(page, `/${locale}/cars/${(await seedCar("s02")).slug}`, long);
    // Where a capped name is smaller
    for (const width of NARROW_PHONES) {
      await page.setViewportSize({ width, height: DESKTOP.height });
      const title = await readTitle(page, long);
      long.forEach((rule, index) => {
        const read = title.names[index];
        if (read === undefined) throw new Error(`No read of ${rule.key}`);
        expectByRule(read, rule, title, `${width} px`);
      });
    }
  });
}

/**
 * Widths at which the step's HEXP is read in a car's title, by group: pairs either side of where it
 * changes, on phones where the screen changes it, and on desktops where the title's column does in
 * each engine, WebKit, which measures a container in whole pixels, a pixel or two after the others;
 * and others. The test checks that the step changes within each pair, so a token that moves a change
 * fails it rather than leaving a pair to one side.
 */
const WIDTHS: Record<string, { pairs: Array<[below: number, above: number]>; others: number[] }> = {
  phones: {
    pairs: [
      [359, 360],
      [389, 390],
      [429, 430],
      [539, 540],
    ],
    others: [320],
  },
  "tablets and laptops": { pairs: [], others: [768, 1023, 1024, 1280, 1366] },
  desktops: {
    pairs: [
      [1452, 1454],
      [1579, 1582],
      [1693, 1696],
    ],
    others: [1440, 1920],
  },
};
/**
 * The phones' widths and the tablets' under 1024 px, where a classic scroll bar takes its width from
 * the title's column and not from the screen's, in groups a test can read in its time
 */
const UNDER_1024 = {
  "small phones": [320, 359, 360, 389],
  "large phones": [390, 429, 430, 539, 540],
  tablets: [768, 1023],
};

/**
 * Holds each catalog name in a title to the rule, and the title's step to its band: a HEXP no further
 * below its band's ratio than the rule allows for, at a ratio never under the language's narrowest,
 * which allows for a browser's rounding of the size and a classic scroll bar on a 320 px phone
 */
function expectAllByRule(title: NamesRead, all: Rule[], locale: Locale, at: string) {
  const ratio = title.column / title.usual;
  const band = BANDS.find(({ hexp }) => hexp === title.step.hexp);
  expect(band, at).toBeDefined();
  expect(ratio, at).toBeGreaterThanOrEqual((band?.from ?? Infinity) - EARLY);
  expect(ratio, at).toBeGreaterThanOrEqual(NARROWEST_RATIO[locale]);
  all.forEach((rule, index) => {
    const read = title.names[index];
    if (read === undefined) throw new Error(`No read of ${rule.key}`);
    expectByRule(read, rule, title, at);
  });
}

for (const locale of LOCALES) {
  for (const [group, { pairs, others }] of Object.entries(WIDTHS)) {
    test(`sets every catalog name by the rule at widths of ${group} in ${locale}, from a band no lower than the rule's`, async ({
      page,
    }) => {
      const all = RULES[locale];
      const widths = [...others, ...pairs.flat()].sort((a, b) => a - b);
      /** The step's HEXP at each width */
      const steps = new Map<number, number>();
      await page.setViewportSize({ width: widths[0] ?? DESKTOP.width, height: DESKTOP.height });
      await openCar(page, `/${locale}/cars/${(await seedCar("s02")).slug}`, all);
      for (const width of widths) {
        await page.setViewportSize({ width, height: DESKTOP.height });
        const title = await readTitle(page, all);
        steps.set(width, title.step.hexp);
        expectAllByRule(title, all, locale, `${width} px`);
        // Below 1024 px the title keeps the letters a phone's screen gives the step elsewhere
        if (width < DESKTOP_FROM) expect(title.step.hexp, `${width} px`).toBe(screenHexp(width));
        const under = all
          .filter((_, index) => (title.names[index]?.size ?? Number.NaN) < 4 * title.body)
          .map(({ key }) => key);
        if (width >= FOUR_TIMES_FROM) {
          expect(
            under.filter((key) => !SMALLER[locale].includes(key)),
            `${width} px`,
          ).toStrictEqual([]);
        }
        // Commander, in English, is the one name set smaller than that at 1024 px
        if (width === DESKTOP_FROM) expect(under, `${width} px`).toStrictEqual(SMALLER[locale]);
      }
      for (const [below, above] of pairs) {
        const at = `the step's HEXP from ${below} to ${above} px`;
        expect(steps.get(below), at).toBeLessThan(steps.get(above) ?? Number.NaN);
      }
    });
  }

  for (const bar of SCROLL_BARS) {
    for (const [group, widths] of Object.entries(UNDER_1024)) {
      test(`sets every catalog name by the rule at widths of ${group} less a ${bar} px classic scroll bar in ${locale}`, async ({
        page,
      }) => {
        const all = RULES[locale];
        await page.setViewportSize({ width: widths[0] ?? DESKTOP.width, height: DESKTOP.height });
        await openCar(page, `/${locale}/cars/${(await seedCar("s02")).slug}`, all);
        for (const width of widths) {
          await page.setViewportSize({ width, height: DESKTOP.height });
          const { column } = await readTitle(page, []);
          // The screen keeps its width, and so the step its size, while the title loses the bar's
          const title = await readTitle(page, all, column - bar);
          expectAllByRule(title, all, locale, `${width} px less a ${bar} px scroll bar`);
        }
      });
    }
  }
}

const fixtures = new CarFixtures();
test.afterEach(() => fixtures.remove());

test("sets a Commander's title as the rule does: in English in HEXP 0, smaller where those letters are wider than the column", async ({
  page,
}) => {
  // A Jeep for sale as a Commander, whose page the server renders with its model
  const slug = await fixtures.copy("s14", "published", { changes: { modelKey: "jeep-commander" } });
  for (const locale of LOCALES) {
    const rule = ruleFor("jeep-commander", locale);
    // Opened once in each language, then resized: sent again to the address it is on, Firefox can ask
    // the server a second time after the load, which Playwright waits on as a navigation that never
    // finishes (D-049)
    await page.setViewportSize({ width: 320, height: DESKTOP.height });
    await openCar(page, `/${locale}/cars/${slug}`, [rule]);
    await expect(page.locator('h1 [data-model="jeep-commander"]')).toHaveText(rule.name);
    for (const width of [320, DESKTOP_FROM]) {
      await page.setViewportSize({ width, height: DESKTOP.height });
      const title = await readTitle(page, []);
      const at = `${locale} at ${width} px`;
      expectByRule(title.own, rule, title, at);
      if (locale === "en") {
        expect(title.own.hexp, at).toBe(0);
        expect(title.own.size, at).toBeLessThan(title.usual);
      } else {
        // In Arabic its name is short, and takes the step's letters and size
        expect(title.own.hexp, at).toBe(title.step.hexp);
        expect(title.own.size, at).toBeCloseTo(title.usual, 1);
      }
    }
  }
});

/**
 * Widths at which a Discovery's title is in one of its ranges or out of them, each further from a
 * bound than a browser's rounding of the column: a phone's and a desktop's, there and back
 */
const DISCOVERY_RESIZES: Record<Locale, Array<{ width: number; inside: boolean }>> = {
  en: [
    { width: 320, inside: true },
    { width: 346, inside: false },
    { width: 320, inside: true },
    { width: 1200, inside: true },
    { width: 1395, inside: false },
    { width: 1200, inside: true },
  ],
  ar: [
    { width: 320, inside: true },
    { width: 350, inside: false },
    { width: 320, inside: true },
    { width: 1200, inside: true },
    { width: 1410, inside: false },
    { width: 1200, inside: true },
  ],
};

test("sets a Discovery's title by the rule as the window takes its column into a range, out and back", async ({
  page,
}) => {
  // A Land Rover for sale as a Discovery, whose name takes HEXP 0 in ranges with the step's between
  const slug = await fixtures.copy("s14", "published", {
    changes: { makeKey: "land-rover", modelKey: "land-rover-discovery" },
  });
  for (const locale of LOCALES) {
    const rule = ruleFor("land-rover-discovery", locale);
    // The page's own name, resized: Firefox keeps a container rule's style on a span whose model
    // changes in place, so the name must leave a rule, and meet it again, as its column does (D-049)
    await page.setViewportSize({ width: 320, height: DESKTOP.height });
    await openCar(page, `/${locale}/cars/${slug}`, [rule]);
    await expect(page.locator('h1 [data-model="land-rover-discovery"]')).toHaveText(rule.name);
    for (const { width, inside } of DISCOVERY_RESIZES[locale]) {
      await page.setViewportSize({ width, height: DESKTOP.height });
      const title = await readTitle(page, []);
      const at = `${locale} at ${width} px`;
      expect(within(rule.ranges, title.column / title.usual), at).toBe(inside);
      expectByRule(title.own, rule, title, at);
      // The step's letters are other than HEXP 0 there, so the name shows which it took
      expect(title.step.hexp, at).not.toBe(0);
      expect(title.own.hexp, at).toBe(inside ? 0 : title.step.hexp);
    }
  }
});
