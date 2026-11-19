import { expect, type Page, test } from "@playwright/test";
import type { PhotoGroup } from "../../src/lib/db/enums.ts";
import { seriousA11yIssues } from "../support/axe.ts";
import { CarFixtures } from "../support/car-fixture.ts";
import { CATALOGS, formatted } from "../support/catalogs.ts";
import { hydrated } from "../support/e2e-page.ts";
import type { FixturePhoto } from "../support/fixture-photos.ts";
import { sideways } from "../support/layout.ts";
import { expectProblems, watchProblems } from "../support/page-problems.ts";

// FR-09.13's evidence strip under the facts (DESIGN §7.2.3), on copies of a seed car with photos of
// their own (fixture-photos.ts), where a photo with a note is the close-up of a panel that isn't
// original: a list of chips, each linking to where its evidence shows, which wrap and stay whole on
// the narrowest screens. The close-ups' chip counts those in the gallery's imperfection group and
// opens the gallery at the group's first photo (FR-09.13a), however often it is followed. A car
// without one has no chip, and so far no strip (FR-09.13c, D-046).

const LOCALES = ["ar", "en"] as const;

const fixtures = new CarFixtures();
test.afterEach(() => fixtures.remove());

/**
 * Six photos, three of them imperfections, two of which are close-ups, one without a note; and an
 * exterior photo that is a third panel's close-up, which the chip leaves out
 */
const PHOTOS: FixturePhoto[] = [
  { group: "exterior" },
  { group: "exterior", note: { en: "A scuff on the bumper's corner" } },
  { group: "imperfection", note: { ar: "خدش على حافة الغطاء", en: "A chip on the bonnet's edge" } },
  { group: "interior" },
  { group: "imperfection", note: {} },
  { group: "imperfection" },
];

/** The close-ups' chip's words for a count */
const closeups = (locale: "ar" | "en", count: number) =>
  formatted(locale, CATALOGS[locale].evidence.closeups, { count });

const stripOf = (page: Page, locale: "ar" | "en") => page.getByRole("list", { name: CATALOGS[locale].evidence.title });

/** The gallery's slides that its filter shows */
const shownSlides = (page: Page) => page.locator("[data-photo]:not([hidden])");

const chip = (page: Page, locale: "ar" | "en", group: PhotoGroup) =>
  page.getByRole("button", { name: CATALOGS[locale].enum.photo_group[group], exact: true });

/**
 * Waits for the page to come to rest after an in-page jump, which glides (FR-02.6): Chromium drops
 * a jump that starts while another still glides, which a visitor's press, made once the link has
 * come into view, never meets
 */
const atRest = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let last = scrollY;
        let still = 0;
        const frame = () => {
          still = scrollY === last ? still + 1 : 0;
          last = scrollY;
          if (still < 3) requestAnimationFrame(frame);
          else resolve();
        };
        requestAnimationFrame(frame);
      }),
  );

for (const locale of LOCALES) {
  test(`counts the close-ups of the panels that aren't original in ${locale} (FR-09.13)`, async ({ page }) => {
    const problems = await watchProblems(page);
    const slug = await fixtures.copy("s01", "published", { photos: PHOTOS });
    await page.goto(`/${locale}/cars/${slug}`);
    const strip = stripOf(page, locale);
    await expect(strip.getByRole("listitem")).toHaveCount(1);
    const link = strip.getByRole("link", { name: closeups(locale, 2), exact: true });
    await expect(link).toHaveAttribute("href", "#photos-imperfection");
    expect(await seriousA11yIssues(page)).toStrictEqual([]);

    // On a 320 and a 360 px screen the chip fits the page, 44 px tall at least
    const overflows = () => strip.evaluate((list) => list.scrollWidth - list.clientWidth);
    for (const width of [320, 360]) {
      await page.setViewportSize({ width, height: 780 });
      expect(await sideways(page), `${width} px`).toBe(0);
      expect(await overflows(), `${width} px`).toBe(0);
      expect((await link.boundingBox())?.height, `${width} px`).toBeGreaterThanOrEqual(44);
    }
    // With the text at twice its size its words wrap within the strip, the chip growing to hold them
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    expect(await overflows(), "text at 200%").toBe(0);
    expect(await link.evaluate((chip) => chip.scrollHeight - chip.clientHeight), "text at 200%").toBe(0);
    await expectProblems(page, problems);
  });
}

test("the close-ups' chip opens the gallery at the imperfections' first, however often it is followed (FR-09.13a)", async ({
  page,
}) => {
  const slug = await fixtures.copy("s01", "published", { photos: PHOTOS });
  await page.goto(`/en/cars/${slug}`);
  await hydrated(page, "en");
  // A page that loaded again would lose it
  await page.evaluate(() => Object.assign(window, { stayed: true }));
  const link = page.getByRole("link", { name: closeups("en", 2), exact: true });
  const imperfections = chip(page, "en", "imperfection");
  const opened = async () => {
    await expect(imperfections).toHaveAttribute("aria-pressed", "true");
    await expect(shownSlides(page)).toHaveCount(3);
    await expect(shownSlides(page).first()).toBeInViewport({ ratio: 0.9 });
    await atRest(page);
  };

  // A link to another part of the page leaves the photos as they are
  await page.getByRole("link", { name: CATALOGS.en.common.skip }).focus();
  await page.keyboard.press("Enter");
  await expect(imperfections).toHaveAttribute("aria-pressed", "false");
  await atRest(page);

  await link.click();
  await opened();
  expect(new URL(page.url()).hash).toBe("#photos-imperfection");

  // After the visitor has shown every photo, a click that opens the link elsewhere leaves them as
  // they are. Followed again from the keyboard, the link changes no fragment, as the address already
  // ends at the group.
  await imperfections.click();
  await expect(shownSlides(page)).toHaveCount(6);
  await link.click({ modifiers: ["ControlOrMeta"] });
  await expect(imperfections).toHaveAttribute("aria-pressed", "false");
  await expect(shownSlides(page)).toHaveCount(6);
  await link.focus();
  await page.keyboard.press("Enter");
  await opened();

  // And from the group's second photo, back to its first
  await shownSlides(page).first().getByRole("button").focus();
  await page.keyboard.press("ArrowRight");
  await expect(shownSlides(page).nth(1)).toBeInViewport({ ratio: 0.9 });
  await link.click();
  await opened();
  await expect(shownSlides(page).nth(1)).not.toBeInViewport();
  expect(await page.evaluate(() => "stayed" in window)).toBe(true);
});

test("leaves the strip out for a car whose close-ups are none of its imperfections (FR-09.13c)", async ({ page }) => {
  const slug = await fixtures.copy("s01", "published", {
    photos: [
      { group: "exterior" },
      { group: "exterior", note: { en: "A scuff on the bumper's corner" } },
      { group: "imperfection" },
    ],
  });
  await page.goto(`/en/cars/${slug}`);
  await hydrated(page, "en");
  await expect(chip(page, "en", "imperfection")).toBeVisible();
  await expect(stripOf(page, "en")).toHaveCount(0);
});
