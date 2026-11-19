import { readFileSync } from "node:fs";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { CarFixtures, seedCar } from "../support/car-fixture.ts";
import { DESKTOP_FROM } from "../support/e2e-page.ts";
import {
  BANDS,
  bandHexp,
  expectByRule,
  FOUR_TIMES_FROM,
  NEAR,
  openCar,
  readTitle,
  ROOM_SHARE,
  ruleFor,
  screenHexp,
  SMALLER,
} from "../support/model-name-rule.ts";

// FR-09's title, the page's h1 (DESIGN §7.2.3). Its trim, which the dealer types, can mix the
// scripts, and each script's part then reads in the trim's order in both languages, the Latin parts
// isolated (DESIGN §10.3). Its model name, at the display step, fits its column whole at every width
// by its model's rule (D-038, D-049, model-name-rule.ts).

const LOCALES = ["ar", "en"] as const;

const fixtures = new CarFixtures();
test.afterEach(() => fixtures.remove());

const titleOf = (page: Page) => page.getByRole("heading", { level: 1 });

/** The box of the first place the text shows in the element */
const boxOf = (element: Locator, text: string) =>
  element.evaluate((root, wanted) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const at = (node.textContent ?? "").indexOf(wanted);
      if (at === -1) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + wanted.length);
      const { left, right, top } = range.getBoundingClientRect();
      return { left, right, top };
    }
    throw new Error(`No "${wanted}" in the element`);
  }, text);

for (const locale of LOCALES) {
  test(`reads a trim that mixes the scripts in its order, its Latin part first, in ${locale} (DESIGN §10.3)`, async ({
    page,
  }) => {
    const slug = await fixtures.copy("s19", "published", { changes: { trim: "E 300 AMG لاين" } });
    await page.goto(`/${locale}/cars/${slug}`);
    const title = titleOf(page);
    const [first, latin, arabic] = await Promise.all(["E 300", "AMG", "لاين"].map((text) => boxOf(title, text)));
    expect(latin?.top).toBe(arabic?.top);
    // The Latin part reads left to right in both languages
    expect(first?.right).toBeLessThan(latin?.left ?? 0);
    // Arabic text reads from the right, so the Latin part, which comes first, is on the right
    if (locale === "ar") expect(latin?.left).toBeGreaterThan(arabic?.right ?? Infinity);
    else expect(latin?.right).toBeLessThan(arabic?.left ?? 0);
  });
}

test("keeps the sign that ends a Latin trim at its end in Arabic", async ({ page }) => {
  await page.goto(`/ar/cars/${(await seedCar("s12")).slug}`);
  const [word, sign] = await Promise.all(["Pure", "+"].map((text) => boxOf(titleOf(page), text)));
  expect(sign?.left).toBeGreaterThanOrEqual((word?.right ?? Infinity) - 1);
});

type SeedRecord = { seedKey: string; status: string; car: { modelKey: string } };
const PUBLIC_SEED = (JSON.parse(readFileSync("seed/cars.json", "utf8")) as SeedRecord[]).filter(
  ({ status }) => status !== "draft",
);
/** The seed's public cars, the first of each model, as the rule fits model names */
const ONE_OF_EACH_MODEL = PUBLIC_SEED.filter(
  ({ car }, index) => PUBLIC_SEED.findIndex((other) => other.car.modelKey === car.modelKey) === index,
);

/**
 * Widths at which a car's title is held to the rule: on phones the screen's bands (D-038), a
 * tablet's, either side of where the title has a column of its own (DESIGN §7.2.3), and the
 * desktops' bands, which that column sets (D-049)
 */
const WIDTHS = [320, 360, 390, 768, 1023, 1024, 1100, 1279, 1280, 1366, 1440, 1500, 1600, 1920] as const;

for (const { seedKey, car } of ONE_OF_EACH_MODEL) {
  test(`fits ${seedKey}'s model name whole at every width, by its own column (D-049)`, async ({ page, isMobile }) => {
    test.skip(isMobile, "the desktop projects try every width, phones' too");
    // A published copy, as a sold seed car's page shows only for its first days
    const slug = await fixtures.copy(seedKey, "published");
    for (const locale of LOCALES) {
      const rule = ruleFor(car.modelKey, locale);
      /** The step's HEXP at each width */
      const steps = new Set<number>();
      await page.setViewportSize({ width: WIDTHS[0], height: 900 });
      await openCar(page, `/${locale}/cars/${slug}`, [rule]);
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        const at = `${locale} at ${width} px`;
        const title = await readTitle(page, []);
        expectByRule(title.own, rule, title, at);
        const ratio = title.column / title.usual;
        // The step takes its band's HEXP by the title's ratio, and on phones the screen's (D-038)
        if (!BANDS.some(({ from }) => Math.abs(ratio - from) * title.usual < NEAR))
          expect(title.step.hexp, at).toBe(bandHexp(ratio));
        if (width < DESKTOP_FROM) expect(title.step.hexp, at).toBe(screenHexp(width));
        steps.add(title.step.hexp);
        // The step's size, and from 1024 px no more than the room share of the column (tokens.css),
        // within half a pixel, as each browser rounds the column and the size its own way
        const room = width < DESKTOP_FROM ? Infinity : (ROOM_SHARE[locale] * title.column) / 100;
        expect(title.usual, at).toBeCloseTo(Math.min(title.display, room), 0);
        if (width >= FOUR_TIMES_FROM && !SMALLER[locale].includes(rule.key))
          expect(title.own.size, at).toBeGreaterThanOrEqual(4 * title.body);
      }
      // The widths take the step through each of its bands
      expect(
        [...steps].sort((a, b) => a - b),
        locale,
      ).toStrictEqual(BANDS.map(({ hexp }) => hexp));
    }
  });
}
