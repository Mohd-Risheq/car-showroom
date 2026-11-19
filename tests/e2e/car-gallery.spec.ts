import { expect, type Page, test } from "@playwright/test";
import type { PhotoGroup } from "../../src/lib/db/enums.ts";
import { seriousA11yIssues } from "../support/axe.ts";
import { CarFixtures, seedCar } from "../support/car-fixture.ts";
import { CATALOGS } from "../support/catalogs.ts";
import { DESKTOP_FROM, hydrated, offerShown, QUIET, tabKey, watchBeacons } from "../support/e2e-page.ts";
import { EIGHTEEN, PHOTO_FILES, watchPhotoFiles } from "../support/fixture-photos.ts";
import { sideways } from "../support/layout.ts";
import { expectProblems, watchProblems } from "../support/page-problems.ts";
import { computed } from "../support/specimen.ts";

// FR-10's gallery on the car page (DESIGN §7.2.3), on copies of a seed car with photos of their own
// (fixture-photos.ts): every photo in the dealer's order with the cover first (FR-10.1), each named
// by its alt text (FR-10.6). A phone swipes through them and counts them, the place in --scan, and
// a desktop shows them from its rail, whose last tile shows the next photo under the count of the
// rest, on a stage of 4:3 where the screen holds it, of 3:2 at the least (D-049); the arrow keys
// step through them in the reading direction from one tab stop; and a group's chip, or the link to
// the imperfections (FR-09.13a), filters them (TC-10-1). Until the visitor turns to the photos, a
// phone loads the cover's file alone, once (NFR-PERF-06), and a desktop the rail's photos with it
// (D-049); without JavaScript the cover shows. A photo whose file is missing shows a neutral tile
// with its alt text, and the page reports it once (FR-10's error state).

const LOCALES = ["ar", "en"] as const;

const fixtures = new CarFixtures();
test.afterEach(() => fixtures.remove());

/** The stage's slides, every photo's, and the ones its filter shows */
const slides = (page: Page) => page.locator("[data-photo]");
const shownSlides = (page: Page) => page.locator("[data-photo]:not([hidden])");

/** The count of the photos below 1024 px */
const counter = (page: Page) => page.getByText(/^\d+ \/ \d+$/);

const chip = (page: Page, locale: "ar" | "en", group: PhotoGroup) =>
  page.getByRole("button", { name: CATALOGS[locale].enum.photo_group[group], exact: true });

/** The console's report of a missing photo's file, which a broken photo's test expects */
const MISSING_FILE =
  /^Failed to load resource: the server responded with a status of 404 \(Not Found\) \(.*\/missing-[^/]+\.webp\)$/;

/** A missing photo's client_error beacon: the photos' code, on the car page's route */
const PHOTO_ERROR = { e: "client_error", l: "en", r: "/[locale]/cars/[slug]", x: "PHOTO" };

/**
 * Whether the focus is in the gallery's column, how much of it the English offer covers, and
 * whether the offer covers all of it
 */
function coverOfFocus() {
  const focus = document.activeElement;
  const offer = document.querySelector("[data-locale-prompt]")?.getBoundingClientRect();
  if (!(focus instanceof HTMLElement) || offer === undefined) {
    return { inGallery: false, covered: 0, hidden: false, name: "" };
  }
  const box = focus.getBoundingClientRect();
  // In whole pixels: a scroll stops on a whole pixel, and the offer's edge can fall between two
  const across = Math.floor(Math.max(0, Math.min(box.right, offer.right) - Math.max(box.left, offer.left)));
  const down = Math.floor(Math.max(0, Math.min(box.bottom, offer.bottom) - Math.max(box.top, offer.top)));
  return {
    inGallery: focus.closest("[data-gallery-column]") !== null,
    covered: (across * down) / (box.width * box.height),
    // Within half a pixel, as each browser rounds the boxes its own way
    hidden:
      box.left >= offer.left - 0.5 &&
      box.right <= offer.right + 0.5 &&
      box.top >= offer.top - 0.5 &&
      box.bottom <= offer.bottom + 0.5,
    name: focus.getAttribute("aria-label") ?? focus.textContent ?? "",
  };
}

/** The colour of the surface a broken photo's tile shows, --surface-2, as the browser computes it */
const surface2 = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = "var(--surface-2)";
    document.body.append(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  });

test("shows every photo in the dealer's order, the cover first, each named by its alt text (FR-10.1, FR-10.6)", async ({
  page,
}) => {
  const problems = await watchProblems(page);
  const { title } = await seedCar("s01");
  const slug = await fixtures.copy("s01", "published", {
    photos: [
      { group: "exterior" },
      { group: "exterior", alt: { en: "The front three-quarters" } },
      { group: "exterior" },
      { group: "interior" },
    ],
    cover: 2,
  });
  await page.goto(`/en/cars/${slug}`);
  await hydrated(page, "en");
  const names = [`${title.en}, exterior`, `${title.en}, exterior`, "The front three-quarters", `${title.en}, interior`];
  for (const [place, name] of names.entries()) {
    await expect(slides(page).nth(place).getByRole("button")).toHaveAccessibleName(name);
  }
  const cover = slides(page).first().locator("img");
  await expect(cover).toHaveJSProperty("complete", true);
  expect(await cover.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);

  // The others' files, once the visitor turns to the photos
  await slides(page).first().getByRole("button").focus();
  const sources = () =>
    slides(page)
      .locator("img")
      .evaluateAll((list) => list.map((image) => image.getAttribute("src")));
  await expect
    .poll(sources)
    .toStrictEqual([
      `${PHOTO_FILES}exterior-3-landscape-480.webp`,
      `${PHOTO_FILES}exterior-1-landscape-480.webp`,
      `${PHOTO_FILES}exterior-2-landscape-480.webp`,
      `${PHOTO_FILES}interior-4-landscape-480.webp`,
    ]);
  await expectProblems(page, problems);
});

test.describe("on a phone", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= DESKTOP_FROM, "from 1024 px the rail shows where the stage is");

  for (const locale of LOCALES) {
    test(`an Imperfections chip shows the group from its first photo, counted within it, and pressed again shows every photo, in ${locale} (TC-10-1)`, async ({
      page,
    }) => {
      const problems = await watchProblems(page);
      await page.goto(`/${locale}/cars/${await fixtures.copy("s01", "published", { photos: EIGHTEEN })}`);
      await hydrated(page, locale);
      await expect(counter(page)).toHaveText("1 / 18");
      const imperfections = chip(page, locale, "imperfection");
      await imperfections.click();
      await expect(imperfections).toHaveAttribute("aria-pressed", "true");
      await expect(counter(page)).toHaveText("1 / 3");
      await expect(shownSlides(page)).toHaveCount(3);
      await expect(shownSlides(page).first().locator("img")).toHaveAttribute("src", /\/imperfection-9-/);
      await expect(shownSlides(page).first()).toBeInViewport({ ratio: 0.9 });

      await imperfections.click();
      await expect(imperfections).toHaveAttribute("aria-pressed", "false");
      await expect(shownSlides(page)).toHaveCount(18);
      await expect(counter(page)).toHaveText("9 / 18");
      await expect(slides(page).nth(8)).toBeInViewport({ ratio: 0.9 });
      await expectProblems(page, problems);
    });
  }

  for (const locale of LOCALES) {
    test(`the stage runs to the screen's edges, its focus ring drawn inside it, in ${locale} (DESIGN §7.2.3, §8.4)`, async ({
      page,
      browserName,
    }) => {
      await page.goto(`/${locale}/cars/${await fixtures.copy("s01", "published", { photos: EIGHTEEN })}`);
      await hydrated(page, locale);
      const frame = page.locator("ul:has(> [data-photo])").locator("..");
      const box = await frame.boundingBox();
      expect(box?.x).toBeCloseTo(0, 0);
      expect(box?.width).toBeCloseTo(page.viewportSize()?.width ?? 0, 0);
      expect(await sideways(page)).toBe(0);
      // From the keyboard, where a ring round the frame would be off the screen
      const stop = slides(page).locator('button[tabindex="0"]');
      await stop.focus();
      await page.keyboard.press(`Shift+${tabKey(browserName)}`);
      await page.keyboard.press(tabKey(browserName));
      await expect(stop).toBeFocused();
      const ring = await frame.evaluate((element) => {
        const inside = getComputedStyle(element, "::after");
        return {
          outline: getComputedStyle(element).outlineStyle,
          border: `${inside.borderTopStyle} ${inside.borderTopColor}`,
          inset: [inside.top, inside.right, inside.bottom, inside.left],
        };
      });
      expect(ring).toStrictEqual({
        outline: "none",
        border: `solid ${await computed(page, "color", "var(--accent)")}`,
        inset: ["0px", "0px", "0px", "0px"],
      });
    });
  }

  test("a swipe brings the next photo in, and the count follows it", async ({ page }) => {
    await page.goto(`/ar/cars/${await fixtures.copy("s01", "published", { photos: EIGHTEEN })}`);
    await hydrated(page, "ar");
    // In Arabic the next photo waits to the left
    await page.locator("ul:has(> [data-photo])").evaluate((track) => track.scrollBy({ left: -track.clientWidth }));
    await expect(slides(page).nth(1)).toBeInViewport({ ratio: 0.9 });
    await expect(counter(page)).toHaveText("2 / 18");
    // Its place in --scan, the mark of the photo in view (DESIGN §3.1)
    const place = counter(page).locator("span");
    await expect(place).toHaveText("2");
    expect(await place.evaluate((span) => getComputedStyle(span).color)).toBe(
      await computed(page, "color", "var(--scan)"),
    );
  });

  test("loads the cover's file alone, once, until a finger lands on the gallery (NFR-PERF-06)", async ({ page }) => {
    const files = watchPhotoFiles(page);
    await page.goto(`/en/cars/${await fixtures.copy("s01", "published", { photos: EIGHTEEN })}`);
    await hydrated(page, "en");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(QUIET);
    expect(files()).toHaveLength(1);
    expect(files()[0]).toMatch(/^exterior-1-landscape-(480|960|1200)\.webp$/);

    await slides(page).first().dispatchEvent("pointerdown");
    await expect.poll(files).toContainEqual(expect.stringMatching(/^exterior-2-landscape-(480|960|1200)\.webp$/));
  });
});

test.describe("on a desktop", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < DESKTOP_FROM, "the rail shows from 1024 px");

  test("loads the rail's thumbnails and its tile's photo with the page, and of the stage's photos the cover alone, until the visitor turns to the photos (D-049)", async ({
    page,
  }) => {
    const files = watchPhotoFiles(page);
    await page.goto(`/en/cars/${await fixtures.copy("s01", "published", { photos: EIGHTEEN })}`);
    await hydrated(page, "en");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(QUIET);
    // The files the cover, the six thumbnails and the tile chose, each asked for once, and no other.
    // An image that chose none yet names its fallback file, which no request matches.
    const chosen = await page
      .locator("[data-photo] img, [data-thumbnail] img, [data-thumbnail] ~ li img")
      .evaluateAll((images) =>
        images.map((image) => {
          const { currentSrc, src } = image as HTMLImageElement;
          return new URL(currentSrc || src).pathname;
        }),
      );
    expect(chosen).toHaveLength(8);
    const names = new Set(chosen.map((path) => path.slice(PHOTO_FILES.length)));
    expect(files().toSorted()).toStrictEqual([...names].toSorted());

    // A press on the stage turns the visitor to the photos, and the stage's other files follow
    await slides(page).first().dispatchEvent("pointerdown");
    await expect.poll(() => files().length).toBeGreaterThan(names.size);
  });

  test("the rail shows the first six photos, and a thumbnail brings its photo into the stage", async ({ page }) => {
    await page.goto(`/en/cars/${await fixtures.copy("s01", "published", { photos: EIGHTEEN })}`);
    await hydrated(page, "en");
    const thumbnails = page.locator("[data-thumbnail] button");
    await expect(thumbnails).toHaveCount(6);
    // The tile after them shows the seventh photo whole, with the count of the rest over its end
    const tile = page.getByRole("button", { name: "Show 12 more photos", exact: true });
    await expect(tile.locator("img")).toHaveAttribute("src", /\/exterior-7-/);
    await expect(tile).toContainText("+12");
    await expect(thumbnails.first()).toHaveAttribute("aria-current", "true");
    await expect(counter(page)).toBeHidden();

    await thumbnails.nth(3).click();
    await expect(slides(page).nth(3)).toBeInViewport({ ratio: 0.9 });
    await expect(thumbnails.nth(3)).toHaveAttribute("aria-current", "true");
    await expect(thumbnails.first()).not.toHaveAttribute("aria-current");
  });

  for (const locale of LOCALES) {
    test(`an Imperfections chip brings the group's first photo into the stage, its thumbnail first and marked, in ${locale} (TC-10-1)`, async ({
      page,
    }) => {
      const problems = await watchProblems(page);
      await page.goto(`/${locale}/cars/${await fixtures.copy("s01", "published", { photos: EIGHTEEN })}`);
      await hydrated(page, locale);
      const thumbnails = page.locator("[data-thumbnail] button");
      const imperfections = chip(page, locale, "imperfection");
      await imperfections.click();
      await expect(imperfections).toHaveAttribute("aria-pressed", "true");
      await expect(shownSlides(page)).toHaveCount(3);
      await expect(shownSlides(page).first().locator("img")).toHaveAttribute("src", /\/imperfection-9-/);
      await expect(shownSlides(page).first()).toBeInViewport({ ratio: 0.9 });
      await expect(thumbnails).toHaveCount(3);
      await expect(thumbnails.first().locator("img")).toHaveAttribute("src", /\/imperfection-9-/);
      await expect(thumbnails.first()).toHaveAttribute("aria-current", "true");

      // Pressed again, it shows every photo, the group's first still in the stage
      await imperfections.click();
      await expect(imperfections).toHaveAttribute("aria-pressed", "false");
      await expect(shownSlides(page)).toHaveCount(18);
      await expect(slides(page).nth(8)).toBeInViewport({ ratio: 0.9 });
      await expectProblems(page, problems);
    });
  }

  test("the stage is 4:3, the photo whole, where the screen holds it with the rail and the chips under it, else as near as they let it, and 3:2 at the least (D-049)", async ({
    page,
  }) => {
    // One visit, the window then resized, as the column's test does. Firefox shows an address
    // visited again from its cache while it revalidates it, and Playwright waited on that visit for
    // good; a reload brings back the page's place, which the keeper holds against a scroll (D-047)
    await page.goto(`/en/cars/${await fixtures.copy("s01", "published", { photos: EIGHTEEN })}`);
    await hydrated(page, "en");
    // A 16:10 screen holds 4:3; a 1536 by 864 screen, 1080p at 125 %, and a 1366 by 768 laptop hold
    // less; a 1280 by 720 one not even that
    for (const { width, height, widest, narrowest } of [
      { width: 1440, height: 900, widest: 4 / 3, narrowest: 4 / 3 },
      { width: 1536, height: 864, widest: 3 / 2, narrowest: 4 / 3 },
      { width: 1366, height: 768, widest: 3 / 2, narrowest: 4 / 3 },
      { width: 1280, height: 720, widest: 3 / 2, narrowest: 3 / 2 },
    ]) {
      await page.setViewportSize({ width, height });
      // Held under the header, before the end of the title's column carries it off, the column's
      // chips still on the screen. At once: a glide, as the page's own scrolls take, was still under
      // way when WebKit read the column
      await page.evaluate(() => scrollTo({ top: 120, behavior: "instant" }));
      const fit = await page.evaluate(() => {
        const stage = document.querySelector("[data-photo] > button")?.getBoundingClientRect();
        const column = document.querySelector("[data-gallery-column]");
        const box = column?.getBoundingClientRect();
        return {
          ratio: (stage?.width ?? 0) / (stage?.height ?? 1),
          top: box?.top ?? Number.NaN,
          held: column ? Number.parseFloat(getComputedStyle(column).top) : Number.NaN,
          bottom: box?.bottom ?? Infinity,
        };
      });
      expect(fit.top, `${width} x ${height}`).toBeCloseTo(fit.held, 0);
      expect(fit.ratio, `${width} x ${height}`).toBeGreaterThanOrEqual(narrowest - 0.01);
      expect(fit.ratio, `${width} x ${height}`).toBeLessThanOrEqual(widest + 0.01);
      if (widest !== narrowest) expect(fit.ratio, `${width} x ${height}`).not.toBeCloseTo(narrowest, 2);
      expect(fit.bottom, `${width} x ${height}`).toBeLessThanOrEqual(height);
    }
  });

  test("the rail marks the photo in view with a --scan bar under its thumbnail, and one the pointer is on with --line (DESIGN §3.1)", async ({
    page,
  }) => {
    await page.goto(`/en/cars/${await fixtures.copy("s01", "published", { photos: EIGHTEEN })}`);
    await hydrated(page, "en");
    const thumbnails = page.locator("[data-thumbnail] button");
    const bar = (place: number) =>
      thumbnails.nth(place).evaluate((button) => {
        const under = getComputedStyle(button, "::after");
        return { colour: under.backgroundColor, height: under.height, bottom: under.bottom };
      });
    const [scan, line] = [await computed(page, "color", "var(--scan)"), await computed(page, "color", "var(--line)")];
    const none = "rgba(0, 0, 0, 0)";
    expect(await bar(0)).toStrictEqual({ colour: scan, height: "2px", bottom: "-8px" });
    expect((await bar(1)).colour).toBe(none);
    await thumbnails.nth(2).hover();
    await expect.poll(async () => (await bar(2)).colour).toBe(line);
    await thumbnails.nth(2).click();
    await expect.poll(async () => (await bar(2)).colour).toBe(scan);
    expect((await bar(0)).colour).toBe(none);
  });

  test("the rail's thumbnail of a photo whose file is missing is a neutral tile, named by its alt text", async ({
    page,
  }) => {
    const { title } = await seedCar("s01");
    const slug = await fixtures.copy("s01", "published", {
      photos: [{ group: "exterior" }, { group: "interior", broken: true }],
    });
    await page.goto(`/en/cars/${slug}`);
    await hydrated(page, "en");
    const thumbnail = page.locator("[data-thumbnail] button").nth(1);
    await expect(thumbnail).toHaveAccessibleName(`${title.en}, interior`);
    await expect(thumbnail.getByRole("img")).toHaveCount(0);
    // The words only name it: they take no room on the tile
    expect((await thumbnail.getByText(`${title.en}, interior`).boundingBox())?.width).toBeLessThanOrEqual(1);
    await expect(thumbnail).toHaveCSS("background-color", await surface2(page));
    await expect(page.locator("[data-thumbnail] button").first().getByRole("img")).toBeVisible();
  });

  test("the rail's tile of the photos past its six is a neutral tile when the seventh photo's file is missing", async ({
    page,
  }) => {
    const photos = EIGHTEEN.map((photo, at) => (at === 6 ? { ...photo, broken: true } : photo));
    await page.goto(`/en/cars/${await fixtures.copy("s01", "published", { photos })}`);
    await hydrated(page, "en");
    // Its file failed as the page loaded, before the gallery's code ran, as a thumbnail's can
    const tile = page.getByRole("button", { name: "Show 12 more photos", exact: true });
    await expect(tile.getByRole("img")).toHaveCount(0);
    await expect(tile).toHaveCSS("background-color", await surface2(page));
    await expect(tile.getByText("+12", { exact: true })).toBeVisible();
  });

  test.describe("for a browser whose first language is English", () => {
    test.use({ locale: "en-US" });

    // The column holds still under the header, where the English offer at the screen's foot would
    // hide the focus on its lowest controls, with no scroll to bring them clear. While the offer
    // shows, the column scrolls with the page, so no control the focus reaches is hidden under it
    // (WCAG 2.4.11, SRS §10.4, D-049).
    for (const size of [
      { width: 1440, height: 900 },
      { width: 1366, height: 768 },
      { width: 1280, height: 800 },
    ]) {
      test(`at ${size.width} by ${size.height} px, the English offer hides no control of the gallery the focus reaches`, async ({
        page,
        browserName,
      }) => {
        // Under reduced motion the scroll to the focus is instant
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.setViewportSize(size);
        await page.goto(`/ar/cars/${await fixtures.copy("s01", "published", { photos: EIGHTEEN })}`);
        await hydrated(page, "ar");
        const column = page.locator("[data-gallery-column]");
        // The focus scrolls clear of the offer by the room the page keeps for it
        await offerShown(page);
        const covered: string[] = [];
        let reached = 0;
        // From the page's start, through the offer and the header, into the gallery and out of it
        for (let press = 0; press < 60; press += 1) {
          await page.keyboard.press(tabKey(browserName));
          const focus = await page.evaluate(coverOfFocus);
          if (!focus.inGallery) {
            if (reached > 0) break;
            continue;
          }
          reached += 1;
          // Chromium and WebKit scroll each control the focus reaches clear of the offer. Firefox
          // scrolls one only when little of it shows inside the scroll padding, so a large one can
          // stay partly under the offer, never wholly (D-049).
          const counts = browserName === "firefox" ? focus.hidden : focus.covered > 0;
          if (counts) covered.push(`${focus.name}: ${Math.round(focus.covered * 100)}%`);
        }
        expect(reached).toBeGreaterThan(3);
        expect(covered).toStrictEqual([]);
        expect(await column.evaluate((element) => getComputedStyle(element).position)).toBe("static");
        // Once the visitor stays in Arabic, the column holds still again
        await page.getByRole("button", { name: CATALOGS.ar.locale.prompt.stay }).click();
        await expect.poll(() => column.evaluate((element) => getComputedStyle(element).position)).toBe("sticky");
      });
    }
  });
});

test("the arrow keys step through the photos in the reading direction, from one tab stop (FR-10.3)", async ({
  page,
}) => {
  await page.goto(`/ar/cars/${await fixtures.copy("s01", "published", { photos: EIGHTEEN })}`);
  await hydrated(page, "ar");
  const buttons = slides(page).locator("button");
  const tabStops = slides(page).locator('button[tabindex="0"]');
  await expect(tabStops).toHaveCount(1);
  await buttons.first().focus();
  await page.keyboard.press("ArrowLeft");
  await expect(buttons.nth(1)).toBeFocused();
  await expect(slides(page).nth(1)).toBeInViewport({ ratio: 0.9 });
  await expect(tabStops).toHaveCount(1);
  await expect(buttons.nth(1)).toHaveAttribute("tabindex", "0");

  await page.keyboard.press("ArrowRight");
  await expect(buttons.first()).toBeFocused();
  // The first photo is as far back as the keys go
  await page.keyboard.press("ArrowRight");
  await expect(buttons.first()).toBeFocused();
  await expect(slides(page).first()).toBeInViewport({ ratio: 0.9 });
});

test("Tab and Shift Tab leave the stage from its one tab stop, which its track is not (FR-10.3)", async ({
  page,
  browserName,
}) => {
  await page.goto(`/ar/cars/${await fixtures.copy("s01", "published", { photos: EIGHTEEN })}`);
  await hydrated(page, "ar");
  const track = page.locator("ul:has(> [data-photo])");
  // Firefox makes a list that scrolls a tab stop of its own, before its first control, unless the
  // list says it isn't one. WebKit's Tab passes over links unless Alt is held, as Safari's does.
  const keys = [`Shift+${tabKey(browserName)}`, tabKey(browserName)];
  for (const key of keys) {
    await slides(page).locator('button[tabindex="0"]').focus();
    await page.keyboard.press(key);
    expect(await track.evaluate((list) => list.contains(document.activeElement)), key).toBe(false);
  }
});

test("a pressed chip fills with --ink, its words in the page's ground, under the pointer too (DESIGN §6.4)", async ({
  page,
}) => {
  await page.goto(`/en/cars/${await fixtures.copy("s01", "published", { photos: EIGHTEEN })}`);
  await hydrated(page, "en");
  const imperfections = chip(page, "en", "imperfection");
  const [ink, ground, line] = [
    await computed(page, "color", "var(--ink)"),
    await computed(page, "color", "var(--bg)"),
    await computed(page, "color", "var(--line)"),
  ];
  await expect(imperfections).toHaveCSS("border-top-color", line);
  await expect(imperfections).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await imperfections.click();
  await expect(imperfections).toHaveAttribute("aria-pressed", "true");
  await expect(imperfections).toHaveCSS("background-color", ink);
  await expect(imperfections).toHaveCSS("border-top-color", ink);
  await expect(imperfections).toHaveCSS("color", ground);
});

test("the link to the imperfections opens the gallery at their group (FR-09.13a)", async ({ page }) => {
  const slug = await fixtures.copy("s01", "published", { photos: EIGHTEEN });
  await page.goto(`/en/cars/${slug}#photos-imperfection`);
  await hydrated(page, "en");
  await expect(chip(page, "en", "imperfection")).toHaveAttribute("aria-pressed", "true");
  await expect(shownSlides(page)).toHaveCount(3);
  await expect(shownSlides(page).first()).toBeInViewport({ ratio: 0.9 });

  // Followed on the page, after the visitor has shown every photo again
  await chip(page, "en", "imperfection").click();
  await expect(shownSlides(page)).toHaveCount(18);
  await page.evaluate(() => {
    location.hash = "";
    location.hash = "photos-imperfection";
  });
  await expect(chip(page, "en", "imperfection")).toHaveAttribute("aria-pressed", "true");
  await expect(shownSlides(page)).toHaveCount(3);
});

test("a photo whose file is missing shows a neutral tile with its alt text, reported once (FR-10)", async ({
  page,
  browserName,
}) => {
  const problems = await watchProblems(page);
  const errors = watchBeacons(page, "client_error");
  const { title } = await seedCar("s01");
  const slug = await fixtures.copy("s01", "published", {
    photos: [{ group: "exterior", broken: true }, { group: "exterior" }, { group: "interior", broken: true }],
  });
  await page.goto(`/en/cars/${slug}`);
  await hydrated(page, "en");
  const cover = slides(page).first().getByRole("button");
  // The cover's file failed as the page loaded, before the gallery's code ran
  const tile = cover.getByText(`${title.en}, exterior`, { exact: true });
  await expect(tile).toBeVisible();
  await expect(tile).toHaveCSS("background-color", await surface2(page));
  await expect(cover.getByRole("img")).toHaveCount(0);
  await expect(cover).toHaveAccessibleName(`${title.en}, exterior`);
  await expect.poll(errors).toStrictEqual([PHOTO_ERROR]);

  // The second missing file, once the visitor turns to the photos, is reported no second time
  await cover.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const third = slides(page).nth(2).getByRole("button");
  await expect(third).toBeFocused();
  await expect(third.getByText(`${title.en}, interior`, { exact: true })).toBeVisible();
  await expect(slides(page).nth(1).getByRole("img")).toBeVisible();
  await page.waitForTimeout(QUIET);
  expect(errors()).toStrictEqual([PHOTO_ERROR]);
  // Every problem the page reports is a missing file's: Chromium and WebKit report the files, and
  // Firefox no load that fails (tests/e2e/problems-harness.spec.ts)
  const missing = problems.filter((problem) => MISSING_FILE.test(problem));
  expect(missing.length > 0, "the missing files reported").toBe(browserName !== "firefox");
  await expectProblems(page, problems, [], { ignoring: [MISSING_FILE] });
});

test("shows one photo alone, with no count, rail or chips (DESIGN §10.3)", async ({ page }) => {
  await page.goto(`/en/cars/${await fixtures.copy("s01", "published", { photos: [{ group: "exterior" }] })}`);
  await hydrated(page, "en");
  await expect(slides(page)).toHaveCount(1);
  await expect(counter(page)).toHaveCount(0);
  await expect(page.locator("[data-thumbnail]")).toHaveCount(0);
  await expect(page.locator("button[aria-pressed]")).toHaveCount(0);
});

for (const locale of LOCALES) {
  test(`never widens the page, before the visitor turns to the photos or after, in ${locale}`, async ({ page }) => {
    await page.goto(`/${locale}/cars/${await fixtures.copy("s01", "published", { photos: EIGHTEEN })}`);
    await hydrated(page, locale);
    expect(await sideways(page)).toBe(0);
    await slides(page).first().getByRole("button").focus();
    await expect(slides(page).nth(1).locator("img")).toBeAttached();
    expect(await sideways(page)).toBe(0);
  });
}

test("holds the stage for a car without photos, with nothing to press", async ({ page }) => {
  await page.goto(`/en/cars/${(await seedCar("s01")).slug}`);
  await hydrated(page, "en");
  await expect(slides(page)).toHaveCount(0);
  await expect(page.locator("article img")).toHaveCount(0);
  await expect(page.locator("button[aria-pressed]")).toHaveCount(0);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("shows the cover, and names every photo after it (DESIGN §10.3)", async ({ page, browserName }) => {
    const came: string[] = [];
    page.on("response", (response) => {
      const { pathname } = new URL(response.url());
      if (response.ok() && pathname.startsWith(PHOTO_FILES)) came.push(pathname.slice(PHOTO_FILES.length));
    });
    await page.goto(`/en/cars/${await fixtures.copy("s01", "published", { photos: EIGHTEEN })}`);
    await expect(slides(page)).toHaveCount(18);
    const cover = slides(page).first().locator("img");
    await expect(cover).toBeVisible();
    // Its file came at the stage's width: the rail's thumbnail of the same photo takes its smallest
    await expect.poll(() => came).toContainEqual(expect.stringMatching(/^exterior-1-landscape-(960|1200)\.webp$/));
    // Playwright's Firefox runs no script of the test's in a page whose own are off: there, the file
    // that came stands for the image
    if (browserName !== "firefox") {
      await expect(cover).toHaveJSProperty("complete", true);
      expect(await cover.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    }
    await expect(slides(page).locator("img")).toHaveCount(1);
    await expect(slides(page).nth(17).getByRole("button")).toHaveAccessibleName(/, exterior$/);
  });
});

for (const locale of LOCALES) {
  test(`a car's gallery has no serious axe issue in ${locale}`, async ({ page }) => {
    await page.goto(`/${locale}/cars/${await fixtures.copy("s01", "published", { photos: EIGHTEEN })}`);
    await hydrated(page, locale);
    expect(await seriousA11yIssues(page)).toStrictEqual([]);
  });
}
