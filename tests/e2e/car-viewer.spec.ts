import { expect, type Locator, type Page, type Request, test } from "@playwright/test";
import { seriousA11yIssues } from "../support/axe.ts";
import { CarFixtures, seedCar } from "../support/car-fixture.ts";
import { CATALOGS, formatted } from "../support/catalogs.ts";
import { DESKTOP_FROM, hydrated, privacyLink, QUIET, tabKey } from "../support/e2e-page.ts";
import { EIGHTEEN, type FixturePhoto, inGroup, watchPhotoFiles } from "../support/fixture-photos.ts";
import { expectProblems, watchProblems } from "../support/page-problems.ts";
import { settled, viewer } from "../support/photo-viewer.ts";

// FR-10's fullscreen viewer (SCR-04, DESIGN §7.2.4), on copies of a seed car with photos of their
// own (fixture-photos.ts): a dialog that holds the focus, named by the group of the photo it shows,
// opened at the photo the visitor pressed (FR-10.2), which previous and next and the arrow keys
// step through in the reading direction (FR-10.3), each photo a button or a key brings in announced
// (DESIGN §8.3). It holds the photos each side of the one in view, loaded ahead (FR-10.5), and its
// close gives the focus back to what opened it (FR-10.7). An imperfection photo carries a caption
// chip with the dealer's note (DESIGN §7.2.4), and a photo whose file is missing a neutral tile
// with its alt text (FR-10). Its zoom buttons, a double tap and a pinch zoom the photo, which a
// drag or the arrow keys then pan (FR-10.4, the owner, 2026-11-09), and on a touch screen a swipe
// across brings in the photo beside it, unannounced, and a swipe down closes the viewer (FR-10.3).
// Its code loads once the visitor turns to the photos: a load that fails is reported once, and the
// next press loads it again (NFR-OBS-02, D-047).

const LOCALES = ["ar", "en"] as const;

declare global {
  interface Window {
    /** Each transition that ran in the viewer, as its element's role or name and its property */
    viewerTransitions: string[];
  }
}

const fixtures = new CarFixtures();
test.afterEach(() => fixtures.remove());

/** The viewer's chunk, the one that defines PhotoViewer, as gsap-loader.spec.ts finds GSAP's */
const VIEWER_MARKER = /["'`]PhotoViewer["'`]/;

/** Five photos: three of the exterior, then two of the interior */
const FIVE: FixturePhoto[] = [...inGroup(3, "exterior"), ...inGroup(2, "interior")];

/** FR-10's edge case: a car of 40 photos */
const FORTY: FixturePhoto[] = inGroup(40, "exterior");

/** The smallest file of the photo at a place (from 1), which a thumbnail shows */
const thumbnailFile = (place: number) => `exterior-${place}-landscape-480.webp`;

/** Opens a copy of s01 with the photos given, hydrated */
async function openCar(page: Page, locale: "ar" | "en", photos: readonly FixturePhoto[]) {
  await page.goto(`/${locale}/cars/${await fixtures.copy("s01", "published", { photos })}`);
  await hydrated(page, locale);
}

/** The stage's slides, and the button that opens the photo at a place (from 1) in the viewer */
const slides = (page: Page) => page.locator("[data-photo]");
const slide = (page: Page, place: number) => page.locator(`[data-photo]:nth-child(${place}) > button`);

/** The rail's tile that opens the viewer at its seventh photo, named for the photos past its six */
const moreTile = (page: Page, locale: "ar" | "en", count: number) =>
  page.getByRole("button", { name: formatted(locale, CATALOGS[locale].car.gallery.more, { count }), exact: true });

/** The thumbnails of desktop's strip, in the viewer's only list */
const strip = (page: Page) => viewer(page).getByRole("list").getByRole("button");

/** The viewer's count of its photos */
const viewerCounter = (page: Page) => viewer(page).getByText(/^\d+ \/ \d+$/);

/** The viewer's photos: the one in view, and the one each side of it */
const viewerSlides = (page: Page) => viewer(page).locator("[data-slide]");

/** The photo the viewer shows: the ones each side of it are hidden */
const viewerPhoto = (page: Page) => viewerSlides(page).getByRole("img");

/** The viewer's slide in view, with its photo and its caption */
const slideInView = (page: Page) => viewer(page).locator("[data-slide]:not([aria-hidden])");

const control = (page: Page, locale: "ar" | "en", name: "close" | "previous" | "next") =>
  viewer(page).getByRole("button", { name: CATALOGS[locale].common[name], exact: true });

/** car.gallery.position for a photo's place in a set */
const position = (locale: "ar" | "en", n: number, total: number) =>
  CATALOGS[locale].car.gallery.position.replace("{n}", String(n)).replace("{total}", String(total));

const zoomButton = (page: Page, locale: "ar" | "en", name: "zoomIn" | "zoomOut") =>
  viewer(page).getByRole("button", { name: CATALOGS[locale].car.gallery[name], exact: true });

/** The scale the viewer shows its photo at: its width on the screen over its width fitted whole */
const shownScale = (page: Page) =>
  viewerPhoto(page).evaluate((image: HTMLImageElement) => image.getBoundingClientRect().width / image.offsetWidth);

/** The photo's largest file, which the viewer lays over it while it is zoomed (FR-10.4) */
const largestFile = (page: Page) => viewer(page).locator('img[alt=""]');

/** Where the middle of the viewer's photo is on the screen */
async function middleOf(page: Page) {
  const box = await viewerPhoto(page).boundingBox();
  expect(box).not.toBeNull();
  return { x: (box?.x ?? 0) + (box?.width ?? 0) / 2, y: (box?.y ?? 0) + (box?.height ?? 0) / 2 };
}

/**
 * Records each transition that runs in the viewer from here on, as its element's role or name and
 * its property, and returns what it recorded: a button's own press and hover answer stay out
 */
async function recordTransitions(page: Page) {
  await page.evaluate(() => {
    window.viewerTransitions = [];
    document.addEventListener(
      "transitionrun",
      ({ target, propertyName }) => {
        if (!(target instanceof Element) || target.closest('[role="dialog"]') === null) return;
        if (target.closest("button") !== null) return;
        window.viewerTransitions.push(`${target.getAttribute("role") ?? target.localName} ${propertyName}`);
      },
      true,
    );
  });
  return () => page.evaluate(() => [...window.viewerTransitions].sort());
}

type Point = { x: number; y: number };

/**
 * A finger's drag on Chromium's touch screen, in even steps, let go `pause` ms after its last step:
 * past the window a release's velocity reads, the drag's distance alone decides where it goes
 */
async function fingerDrag(page: Page, from: Point, to: Point, pause = 200) {
  const cdp = await page.context().newCDPSession(page);
  const at = (share: number) => [{ id: 0, x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(0) });
  for (let step = 1; step <= 8; step += 1) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(step / 8) });
  }
  await page.waitForTimeout(pause);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/** A drag across the middle of the viewer's photo, 220 px the way given: -1 to the left */
const across = async (page: Page, way: -1 | 1) => {
  const { x, y } = await middleOf(page);
  await fingerDrag(page, { x: x - way * 110, y }, { x: x + way * 110, y });
};

/**
 * What a modal dialog holds of the page: the lock on its scroll, and each element it hid from
 * everything else
 */
const held = (page: Page) =>
  page.evaluate(() => {
    const locked = [document.documentElement, document.body].some(
      (element) =>
        element.hasAttribute("data-base-ui-scroll-locked") || /hidden|clip/.test(getComputedStyle(element).overflowY),
    );
    return Number(locked) + document.querySelectorAll("[data-base-ui-inert], [inert]").length;
  });

test("closes when the visitor steps on from the car's page, and is closed on the way back (Activity)", async ({
  page,
}) => {
  const slug = await fixtures.copy("s01", "published", { photos: inGroup(3, "exterior") });
  await page.goto(`/en/cars/${slug}`);
  await hydrated(page, "en");
  // Next.js keeps a page it left in the document, hidden, for the way back
  await privacyLink(page, "en").click();
  await expect(page).toHaveURL(/\/en\/privacy$/);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/en/cars/${slug}$`));

  expect(await held(page)).toBe(0);
  await slides(page).first().getByRole("button").click();
  const viewer = page.getByRole("dialog");
  await expect(viewer).toBeVisible();
  await expect.poll(() => held(page)).toBeGreaterThan(0);

  await page.goForward();
  await expect(page).toHaveURL(/\/en\/privacy$/);
  await expect(viewer).toBeHidden();
  // The page the visitor stepped on to scrolls, and nothing covers it
  await expect.poll(() => held(page)).toBe(0);
  await privacyLink(page, "en").click({ trial: true });

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/en/cars/${slug}$`));
  await expect(slides(page).first()).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await held(page)).toBe(0);
});

test("opens at the photo the visitor presses, a dialog that holds the focus, named by the photo's group (FR-10.2)", async ({
  page,
}) => {
  const problems = await watchProblems(page);
  await openCar(page, "en", FIVE);
  await slide(page, 4).click();
  await expect(viewer(page)).toBeVisible();
  await expect(viewer(page)).toHaveAccessibleName(CATALOGS.en.enum.photo_group.interior);
  await expect(viewerCounter(page)).toHaveText("4 / 5");
  await expect(viewerPhoto(page)).toHaveAttribute("src", /\/interior-4-landscape-480\.webp$/);
  // The title takes the focus (DESIGN §8.4), and Tab stays among the viewer's controls: past the
  // last, WebKit lands on the guard after the dialog a moment before Base UI sends it to the first
  await expect(viewer(page).getByRole("heading")).toBeFocused();
  for (let press = 0; press < 4; press += 1) {
    await page.keyboard.press("Tab");
    await expect.poll(() => viewer(page).evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  }
  expect(await held(page)).toBeGreaterThan(0);
  await expectProblems(page, problems);
});

test("reports the viewer's chunk once when it fails to load, and the next press opens it (NFR-OBS-02, D-047)", async ({
  page,
  browserName,
}) => {
  const failed: string[] = [];
  const connection = { lost: true };
  await page.route("**/_next/static/chunks/**", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (!connection.lost || !VIEWER_MARKER.test(body)) return route.fulfill({ response, body });
    failed.push(route.request().url());
    return route.abort("internetdisconnected");
  });
  const errors: unknown[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname !== "/api/events") return;
    const body = request.postDataJSON() as { e: string };
    if (body.e === "client_error") errors.push(body);
  });
  const problems = await watchProblems(page);
  await openCar(page, "en", FIVE);
  await slide(page, 2).click();
  const error = { e: "client_error", l: "en", r: "/[locale]/cars/[slug]", x: "CHUNK_VIEWER" };
  await expect.poll(() => errors).toStrictEqual([error]);
  await expect(viewer(page)).toHaveCount(0);
  connection.lost = false;
  await slide(page, 2).click();
  await expect(viewer(page)).toBeVisible();
  await expect(viewerCounter(page)).toHaveText("2 / 5");
  await page.waitForTimeout(QUIET);
  expect(errors).toStrictEqual([error]);
  // Chromium reports each try at the chunk, which Turbopack's runtime makes again once after a
  // network error; WebKit and Firefox report none
  const reports = failed.map((url) => `Failed to load resource: net::ERR_INTERNET_DISCONNECTED (${url})`);
  await expectProblems(page, problems, browserName === "chromium" ? reports : []);
});

test("ArrowLeft brings in the next photo in Arabic, and ArrowRight the one before it (TC-10-2)", async ({ page }) => {
  await openCar(page, "ar", FIVE);
  await slide(page, 1).click();
  await expect(viewerCounter(page)).toHaveText("1 / 5");
  // Its keys reach it once its title has the focus (DESIGN §8.4), a frame or more after a pointer
  // opens it: in WebKit under a whole run's load, more than a second (D-049)
  await expect(viewer(page).getByRole("heading")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(viewerCounter(page)).toHaveText("2 / 5");
  await expect(viewerPhoto(page)).toHaveAttribute("src", /\/exterior-2-landscape-480\.webp$/);
  await page.keyboard.press("ArrowRight");
  await expect(viewerCounter(page)).toHaveText("1 / 5");
  // The first photo is as far back as the keys go
  await page.keyboard.press("ArrowRight");
  await expect(viewerCounter(page)).toHaveText("1 / 5");
  await expect(viewerPhoto(page)).toHaveAttribute("src", /\/exterior-1-landscape-480\.webp$/);
});

for (const locale of LOCALES) {
  test(`previous and next step through the photos, each unavailable at its end, in ${locale} (FR-10.3)`, async ({
    page,
  }) => {
    await openCar(page, locale, FIVE);
    await slide(page, 5).click();
    const [previous, next] = [control(page, locale, "previous"), control(page, locale, "next")];
    await expect(viewerCounter(page)).toHaveText("5 / 5");
    await expect(next).toHaveAttribute("aria-disabled", "true");
    // Over the photo an unavailable one keeps its disc solid, its caret faded (DESIGN §7.2.4)
    const look = (button: Locator) =>
      button.evaluate((element) => ({
        disc: getComputedStyle(element).opacity,
        caret: getComputedStyle(element.firstElementChild ?? element).opacity,
      }));
    await expect.poll(() => look(next)).toStrictEqual({ disc: "1", caret: "0.4" });
    await expect.poll(() => look(previous)).toStrictEqual({ disc: "1", caret: "1" });
    // Playwright waits for a button that is unavailable to become available before it presses it
    await next.click({ force: true });
    await expect(viewerCounter(page)).toHaveText("5 / 5");
    await previous.click();
    await expect(viewerCounter(page)).toHaveText("4 / 5");
    await expect(next).not.toHaveAttribute("aria-disabled");
    for (const place of [3, 2, 1]) {
      await previous.click();
      await expect(viewerCounter(page)).toHaveText(`${place} / 5`);
    }
    await expect(previous).toHaveAttribute("aria-disabled", "true");
    await previous.click({ force: true });
    await expect(viewerCounter(page)).toHaveText("1 / 5");
    await next.click();
    await expect(viewerCounter(page)).toHaveText("2 / 5");
    // Previous sits at the start of the screen, so on the right in Arabic (DESIGN §4.6)
    const [start, end] = [await previous.boundingBox(), await next.boundingBox()];
    expect(locale === "ar" ? (start?.x ?? 0) > (end?.x ?? 0) : (start?.x ?? 0) < (end?.x ?? 0)).toBe(true);
  });
}

for (const locale of LOCALES) {
  test(`Escape and the close button close it, and the focus goes back to the photo that opened it, in ${locale} (TC-10-3)`, async ({
    page,
  }) => {
    await openCar(page, locale, FIVE);
    const opener = slide(page, 3);
    await opener.click();
    await expect(viewerCounter(page)).toHaveText("3 / 5");
    // The next photo, in the reading direction, once the viewer's keys reach it (as in TC-10-2's)
    await expect(viewer(page).getByRole("heading")).toBeFocused();
    await page.keyboard.press(locale === "ar" ? "ArrowLeft" : "ArrowRight");
    await expect(viewerCounter(page)).toHaveText("4 / 5");
    await page.keyboard.press("Escape");
    await expect(viewer(page)).toBeHidden();
    await expect(opener).toBeFocused();
    expect(await held(page)).toBe(0);

    await opener.click();
    // It opens at the photo pressed again, not where it was left
    await expect(viewerCounter(page)).toHaveText("3 / 5");
    await control(page, locale, "close").click();
    await expect(viewer(page)).toBeHidden();
    await expect(opener).toBeFocused();
    expect(await held(page)).toBe(0);
  });
}

for (const locale of LOCALES) {
  test(`announces each photo a button or a key brings in, its place and then its alt text, in ${locale} (DESIGN §8.3)`, async ({
    page,
  }) => {
    const { title } = await seedCar("s01");
    await openCar(page, locale, FIVE);
    await slide(page, 1).click();
    const announcement = viewer(page).locator('[aria-live="polite"]');
    const alt = async () => (await viewerPhoto(page).getAttribute("alt")) ?? "";
    // The dialog's name and its focused title say where the visitor is as it opens
    await expect(announcement).toHaveText("");
    await expect(viewer(page).getByRole("heading")).toBeFocused();
    await control(page, locale, "next").click();
    await expect(viewerCounter(page)).toHaveText("2 / 5");
    if (locale === "en") expect(await alt()).toBe(`${title.en}, exterior`);
    await expect(announcement.locator("p")).toHaveText([position(locale, 2, 5), await alt()]);
    await page.keyboard.press(locale === "en" ? "ArrowRight" : "ArrowLeft");
    await expect(viewerCounter(page)).toHaveText("3 / 5");
    await expect(announcement.locator("p")).toHaveText([position(locale, 3, 5), await alt()]);
  });
}

/** A close-up's note, as the dealer wrote it in each language */
const NOTE = { ar: "خدش على حافة الغطاء", en: "A chip on the hood's edge" };

for (const locale of LOCALES) {
  test(`an imperfection photo carries the chip Imperfection with the dealer's note, in ${locale} (DESIGN §7.2.4)`, async ({
    page,
  }) => {
    // A close-up outside the imperfection group, one in it, and an imperfection photo with no note
    await openCar(page, locale, [
      { group: "exterior", note: NOTE },
      { group: "imperfection", note: NOTE },
      { group: "imperfection" },
    ]);
    await slide(page, 1).click();
    await settled(page);
    const chip = slideInView(page).getByText(CATALOGS[locale].car.gallery.imperfection, { exact: true });
    const note = slideInView(page).getByText(NOTE[locale], { exact: true });
    await expect(viewerPhoto(page)).toBeVisible();
    await expect(chip).toHaveCount(0);
    await expect(note).toHaveCount(0);

    await control(page, locale, "next").click();
    await expect(chip).toBeVisible();
    await expect(note).toBeVisible();
    await expect(note).toHaveAttribute("lang", locale);
    // The caption keeps its size as the photo zooms under it
    const width = (await chip.boundingBox())?.width ?? 0;
    await zoomButton(page, locale, "zoomIn").click();
    await expect.poll(() => shownScale(page)).toBeCloseTo(2, 2);
    expect((await chip.boundingBox())?.width).toBeCloseTo(width, 0);

    await control(page, locale, "next").click();
    await expect(chip).toBeVisible();
    await expect(note).toHaveCount(0);
  });
}

test("a long note wraps within the measure rather than across the screen (DESIGN §3.4)", async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < DESKTOP_FROM, "A phone's screen is narrower than the measure");
  // 188 characters, of the 200 a panel's note holds
  const long = { en: Array.from({ length: 7 }, () => "A chip on the hood's edge,").join(" ") };
  await openCar(page, "en", [{ group: "imperfection", note: long }]);
  await slide(page, 1).click();
  const caption = slideInView(page).getByText(long.en, { exact: true }).locator("..");
  await expect(caption).toBeVisible();
  expect((await caption.boundingBox())?.width).toBeLessThan((viewport?.width ?? 0) / 2);
});

test("a note the dealer wrote only in the other language shows as written, marked with its language (DESIGN §7.2.4)", async ({
  page,
}) => {
  await openCar(page, "ar", [{ group: "imperfection", note: { en: NOTE.en } }]);
  await slide(page, 1).click();
  const note = slideInView(page).getByText(NOTE.en, { exact: true });
  await expect(note).toHaveAttribute("lang", "en");
  await expect(note).toHaveAttribute("dir", "ltr");
  // With no label: the caption is the chip and the note
  await expect(note.locator("..")).toHaveText(`${CATALOGS.ar.car.gallery.imperfection} ${NOTE.en}`);
});

test("shows a photo whose file is missing as a neutral tile with its alt text (FR-10)", async ({ page, viewport }) => {
  const { title } = await seedCar("s01");
  // The eighth photo's file, past the rail and too far along the page's track to load there: the
  // viewer is the first to ask for it, from desktop's strip or as it steps to it
  await openCar(page, "ar", [...inGroup(7, "exterior"), { group: "interior", broken: true }]);
  await slide(page, 1).click();
  const alt = `${title.ar}، من الداخل`;
  if ((viewport?.width ?? 0) >= DESKTOP_FROM) {
    // Desktop's strip names its thumbnail by the alt text, on a neutral tile
    const thumbnail = strip(page).nth(7);
    await expect(thumbnail).toHaveAccessibleName(alt);
    await expect(thumbnail.getByRole("img")).toHaveCount(0);
  }
  for (let step = 1; step < 8; step += 1) await control(page, "ar", "next").click();
  await expect(viewerCounter(page)).toHaveText("8 / 8");
  await expect(slideInView(page).getByText(alt, { exact: true })).toBeVisible();
  await expect(slideInView(page).getByRole("img")).toHaveCount(0);
  // The photo before it shows as it did
  await control(page, "ar", "previous").click();
  await expect(viewerPhoto(page)).toBeVisible();
});

test("holds the photo in view and the one each side of it, loaded at the width each takes on the screen (FR-10.5)", async ({
  page,
}) => {
  await openCar(page, "en", FIVE);
  await slide(page, 3).click();
  const images = viewerSlides(page).locator("img");
  const sources = () => images.evaluateAll((list) => list.map((image) => image.getAttribute("src")));
  await expect
    .poll(sources)
    .toStrictEqual(["exterior-2", "exterior-3", "interior-4"].map((name) => expect.stringContaining(`/${name}-`)));
  await expect
    .poll(() =>
      images.evaluateAll((list: HTMLImageElement[]) => list.every((image) => image.complete && image.naturalWidth > 0)),
    )
    .toBe(true);
  await settled(page);
  const widths = await images.evaluateAll((list: HTMLImageElement[]) =>
    list.map((image) => ({ sizes: image.sizes, width: image.getBoundingClientRect().width })),
  );
  for (const { sizes, width } of widths) expect(Math.abs(Number.parseFloat(sizes) - width)).toBeLessThan(1);

  await control(page, "en", "next").click();
  await expect
    .poll(sources)
    .toStrictEqual(["exterior-3", "interior-4", "interior-5"].map((name) => expect.stringContaining(`/${name}-`)));
});

for (const locale of LOCALES) {
  test(`holds the next photo on the right in English and on the left in Arabic, in ${locale} (DESIGN §4.6)`, async ({
    page,
  }) => {
    await openCar(page, locale, FIVE);
    await slide(page, 3).click();
    await settled(page);
    // Each photo's place from the one in view, in screens to the right: the one before, then the
    // next
    const places = await viewerSlides(page).evaluateAll((list) => {
      const shown = list.find((held) => !held.hasAttribute("aria-hidden"))?.getBoundingClientRect();
      if (shown === undefined) return [];
      return list.map((held) => Math.round((held.getBoundingClientRect().left - shown.left) / shown.width));
    });
    expect(places).toStrictEqual(locale === "en" ? [-1, 0, 1] : [1, 0, -1]);
  });
}

test("fits a portrait photo whole on the screen, letterboxed (DESIGN §7.2.4)", async ({ page }) => {
  await openCar(page, "en", [{ group: "exterior" }, { group: "exterior", portrait: true }]);
  await slide(page, 2).click();
  await expect(viewerPhoto(page)).toHaveAttribute("src", /-portrait-480\.webp$/);
  await settled(page);
  const box = await viewerPhoto(page).boundingBox();
  const screen = page.viewportSize();
  expect(box !== null && screen !== null).toBe(true);
  if (box === null || screen === null) return;
  expect(box.width / box.height).toBeCloseTo(3 / 4, 2);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(screen.height);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(screen.width);
});

test("full screen opens the viewer at the photo in view", async ({ page }) => {
  await openCar(page, "en", FIVE);
  await slide(page, 1).focus();
  await page.keyboard.press("ArrowRight");
  await expect(slide(page, 2)).toBeFocused();
  const fullscreen = page.getByRole("button", { name: CATALOGS.en.car.gallery.fullscreen, exact: true });
  await fullscreen.click();
  await expect(viewerCounter(page)).toHaveText("2 / 5");
  await page.keyboard.press("Escape");
  await expect(fullscreen).toBeFocused();
});

test("opened from a group's photos, shows that group's, counted within it", async ({ page }) => {
  await openCar(page, "en", FIVE);
  await page.getByRole("button", { name: CATALOGS.en.enum.photo_group.interior, exact: true }).click();
  await page.locator("[data-photo]:not([hidden])").first().getByRole("button").click();
  await expect(viewerCounter(page)).toHaveText("1 / 2");
  await control(page, "en", "next").click();
  await expect(viewerCounter(page)).toHaveText("2 / 2");
  await expect(control(page, "en", "next")).toHaveAttribute("aria-disabled", "true");
});

test("with 40 photos, a phone loads no thumbnail, as its viewer has no strip (FR-10's edge case)", async ({
  page,
  viewport,
}) => {
  test.skip((viewport?.width ?? 0) >= DESKTOP_FROM, "the strip shows from 1024 px");
  const files = watchPhotoFiles(page);
  await openCar(page, "en", FORTY);
  await slide(page, 1).click();
  await expect(viewerCounter(page)).toHaveText("1 / 40");
  for (let press = 0; press < 5; press += 1) await page.keyboard.press("ArrowRight");
  await expect(viewerCounter(page)).toHaveText("6 / 40");
  await page.waitForTimeout(QUIET);
  expect(files().filter((file) => file.endsWith("-480.webp"))).toStrictEqual([]);
});

test("shows one photo alone, with no count and nothing to step to (DESIGN §10.3)", async ({ page }) => {
  await openCar(page, "en", [{ group: "exterior" }]);
  await slide(page, 1).click();
  await expect(viewer(page)).toBeVisible();
  await expect(viewerCounter(page)).toHaveCount(0);
  await expect(control(page, "en", "previous")).toHaveCount(0);
  await expect(control(page, "en", "next")).toHaveCount(0);
  await expect(viewer(page).locator("img")).toHaveCount(1);
});

test("from the keyboard it opens and closes at once, and for a pointer it fades as its photo grows (DESIGN §4.2)", async ({
  page,
}) => {
  await openCar(page, "en", FIVE);
  // The dialog's fade and its stage's grow
  const transitions = await recordTransitions(page);
  // The first press comes before the viewer's code has arrived
  await slide(page, 1).click();
  await expect.poll(transitions).toStrictEqual(["dialog opacity", "div scale"]);
  await control(page, "en", "close").click();
  await expect(viewer(page)).toBeHidden();
  const pointer = ["dialog opacity", "dialog opacity", "div scale"];
  expect(await transitions()).toStrictEqual(pointer);

  await slide(page, 1).focus();
  await page.keyboard.press("Enter");
  await expect(viewer(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer(page)).toBeHidden();
  expect(await transitions()).toStrictEqual(pointer);
});

test("the zoom buttons zoom the photo to 2x and 3x and back out, each unavailable at its end (FR-10.4)", async ({
  page,
}) => {
  await openCar(page, "en", FIVE);
  await slide(page, 2).click();
  await settled(page);
  const [zoomIn, zoomOut] = [zoomButton(page, "en", "zoomIn"), zoomButton(page, "en", "zoomOut")];
  await expect(zoomOut).toHaveAttribute("aria-disabled", "true");
  await expect(largestFile(page)).toHaveCount(0);

  await zoomIn.click();
  await expect.poll(() => shownScale(page)).toBeCloseTo(2, 2);
  // The photo's largest file comes in over it
  await expect(largestFile(page)).toHaveAttribute("src", /\/exterior-2-landscape-1200\.webp$/);
  await zoomIn.click();
  await expect.poll(() => shownScale(page)).toBeCloseTo(3, 2);
  await expect(zoomIn).toHaveAttribute("aria-disabled", "true");

  await zoomOut.click();
  await expect.poll(() => shownScale(page)).toBeCloseTo(2, 2);
  await zoomOut.click();
  await expect.poll(() => shownScale(page)).toBeCloseTo(1, 2);
  await expect(zoomOut).toHaveAttribute("aria-disabled", "true");
  await expect(zoomIn).not.toHaveAttribute("aria-disabled", "true");
  await expect(largestFile(page)).toHaveCount(0);
});

test("starts each photo it steps to fitted whole, as it does at each open and on a new screen size (FR-10.4)", async ({
  page,
}) => {
  await openCar(page, "en", FIVE);
  await slide(page, 2).click();
  await settled(page);
  const [zoomIn, zoomOut] = [zoomButton(page, "en", "zoomIn"), zoomButton(page, "en", "zoomOut")];
  await zoomIn.click();
  await expect.poll(() => shownScale(page)).toBeCloseTo(2, 2);
  await control(page, "en", "next").click();
  await expect(viewerCounter(page)).toHaveText("3 / 5");
  expect(await shownScale(page)).toBeCloseTo(1, 2);
  await expect(zoomOut).toHaveAttribute("aria-disabled", "true");

  await zoomIn.click();
  await expect.poll(() => shownScale(page)).toBeCloseTo(2, 2);
  await page.keyboard.press("Escape");
  await expect(viewer(page)).toBeHidden();
  await slide(page, 2).click();
  await expect(viewerCounter(page)).toHaveText("2 / 5");
  await settled(page);
  expect(await shownScale(page)).toBeCloseTo(1, 2);
  await expect(zoomOut).toHaveAttribute("aria-disabled", "true");

  // As when the phone turns
  await zoomIn.click();
  await expect.poll(() => shownScale(page)).toBeCloseTo(2, 2);
  const screen = page.viewportSize();
  await page.setViewportSize({ width: (screen?.width ?? 0) - 40, height: screen?.height ?? 0 });
  await expect.poll(() => shownScale(page)).toBeCloseTo(1, 2);
  await expect(zoomOut).toHaveAttribute("aria-disabled", "true");
});

test("a zoom button pressed from the keyboard zooms at once, and for a pointer the photo glides (DESIGN §4.2)", async ({
  page,
}) => {
  await openCar(page, "en", FIVE);
  await slide(page, 1).click();
  await settled(page);
  const transitions = await recordTransitions(page);
  const zoomIn = zoomButton(page, "en", "zoomIn");
  await zoomIn.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => shownScale(page)).toBeCloseTo(2, 2);
  expect(await transitions()).toStrictEqual([]);
  await zoomIn.click();
  await expect.poll(() => shownScale(page)).toBeCloseTo(3, 2);
  expect(await transitions()).toStrictEqual(["div transform"]);
});

test("under reduced motion it only fades, with no grow as it opens and no glide as a pointer zooms (DESIGN §4.5)", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openCar(page, "en", FIVE);
  const transitions = await recordTransitions(page);
  await slide(page, 1).click();
  await settled(page);
  await zoomButton(page, "en", "zoomIn").click();
  await expect.poll(() => shownScale(page)).toBeCloseTo(2, 2);
  expect(await transitions()).toStrictEqual(["dialog opacity"]);
});

for (const locale of LOCALES) {
  test(`the arrow keys look around a zoomed photo, held to its edges, and step again at 1x, in ${locale}`, async ({
    page,
  }) => {
    await openCar(page, locale, FIVE);
    await slide(page, 1).click();
    await settled(page);
    const start = await middleOf(page);
    const width = page.viewportSize()?.width ?? 0;
    await zoomButton(page, locale, "zoomIn").focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => shownScale(page)).toBeCloseTo(2, 2);
    // ArrowRight brings the photo's right side into view, a tenth of the screen, in Arabic as in
    // English (the owner, 2026-11-09), at once, as a key's zoom does (DESIGN §4.2)
    const transitions = await recordTransitions(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await middleOf(page)).x - start.x).toBeCloseTo(-width / 10, 0);
    expect(await transitions()).toStrictEqual([]);
    // And ArrowLeft its left, as far as its edge, stepping to no other photo
    for (let press = 0; press < 30; press += 1) await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => (await viewerPhoto(page).boundingBox())?.x).toBeCloseTo(0, 0);
    await expect(viewerCounter(page)).toHaveText("1 / 5");
    // At 1x the arrows step through the photos again (FR-10.3)
    await zoomButton(page, locale, "zoomOut").focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => shownScale(page)).toBeCloseTo(1, 2);
    await page.keyboard.press(locale === "ar" ? "ArrowLeft" : "ArrowRight");
    await expect(viewerCounter(page)).toHaveText("2 / 5");
  });
}

test("a viewer whose code arrives after the visitor stepped on opens neither there nor on the way back (Activity)", async ({
  page,
}) => {
  await openCar(page, "en", FIVE);
  await page.waitForLoadState("networkidle");
  // The viewer's code, which a finger landing on a photo asks for
  const requested: string[] = [];
  const listen = (request: Request) => {
    if (request.resourceType() === "script") requested.push(request.url());
  };
  page.on("request", listen);
  await slide(page, 1).dispatchEvent("pointerdown");
  await expect.poll(() => requested.length).toBeGreaterThan(0);
  await page.waitForTimeout(QUIET);
  page.off("request", listen);
  const code = new Set(requested);

  // On a slow network it comes after the visitor has pressed the photo and stepped on
  const releases: (() => void)[] = [];
  await page.route(
    (url) => code.has(url.href),
    async (route) => {
      await new Promise<void>((resolve) => releases.push(resolve));
      await route.continue();
    },
  );
  await page.reload();
  await hydrated(page, "en");
  await slide(page, 1).click();
  await expect.poll(() => releases.length).toBeGreaterThan(0);
  await privacyLink(page, "en").click();
  await expect(page).toHaveURL(/\/en\/privacy$/);
  const arrived = [...code].map((url) => page.waitForResponse(url));
  for (const release of releases) release();
  await Promise.all(arrived);
  await page.waitForTimeout(QUIET);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await held(page)).toBe(0);

  await page.goBack();
  await expect(page).toHaveURL(/\/en\/cars\//);
  await expect(slides(page).first()).toBeVisible();
  await page.waitForTimeout(QUIET);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await held(page)).toBe(0);
});

test.describe("on a desktop", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < DESKTOP_FROM, "the rail shows from 1024 px");

  for (const locale of LOCALES) {
    test(`the rail's tile opens the viewer at the seventh photo, in ${locale}`, async ({ page }) => {
      await openCar(page, locale, EIGHTEEN);
      const tile = moreTile(page, locale, 12);
      await tile.click();
      await expect(viewerCounter(page)).toHaveText("7 / 18");
      await page.keyboard.press("Escape");
      await expect(tile).toBeFocused();
    });
  }

  for (const locale of LOCALES) {
    test(`a drag pans a zoomed photo with the pointer, held to its edges, in ${locale} (FR-10.4)`, async ({ page }) => {
      await openCar(page, locale, FIVE);
      await slide(page, 1).click();
      await settled(page);
      const start = await middleOf(page);
      await zoomButton(page, locale, "zoomIn").click();
      await expect.poll(() => shownScale(page)).toBeCloseTo(2, 2);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      // The photo goes where the pointer goes, in Arabic as in English
      await page.mouse.move(start.x + 100, start.y + 40, { steps: 4 });
      const moved = await middleOf(page);
      expect(moved.x - start.x).toBeCloseTo(100, 0);
      expect(moved.y - start.y).toBeCloseTo(40, 0);
      // And on over the viewer's bar and its controls
      const close = await control(page, locale, "close").boundingBox();
      const bar = (close?.y ?? 0) + (close?.height ?? 0) / 2;
      await page.mouse.move(start.x + 100, bar, { steps: 4 });
      const over = await middleOf(page);
      await page.mouse.move(start.x, bar, { steps: 4 });
      expect((await middleOf(page)).x - over.x).toBeCloseTo(-100, 0);
      // As far as the window's edge, its left edge goes no further than the screen's. The pointer
      // stays in the window: Playwright's Firefox reports one past it at x 0.
      await page.mouse.move((page.viewportSize()?.width ?? 0) - 1, bar, { steps: 4 });
      expect((await viewerPhoto(page).boundingBox())?.x).toBeCloseTo(0, 0);
      // Let go over the bar, the drag ends: the photo stays as the pointer comes back over it
      await page.mouse.up();
      const left = await middleOf(page);
      await page.mouse.move(start.x, start.y, { steps: 4 });
      expect(await middleOf(page)).toStrictEqual(left);
    });
  }

  test("its strip shows every photo, the one in view marked, and a thumbnail brings in its photo, announced", async ({
    page,
  }) => {
    await openCar(page, "en", FIVE);
    await slide(page, 1).click();
    await settled(page);
    await expect(strip(page)).toHaveCount(5);
    await expect(strip(page).nth(0)).toHaveAttribute("aria-current", "true");
    await expect(strip(page).locator("img").first()).toHaveAttribute("loading", "lazy");
    await strip(page).nth(3).click();
    await expect(viewerCounter(page)).toHaveText("4 / 5");
    await expect(strip(page).nth(3)).toHaveAttribute("aria-current", "true");
    await expect(strip(page).nth(0)).not.toHaveAttribute("aria-current");
    await expect(viewer(page).locator('[aria-live="polite"] p').first()).toHaveText(position("en", 4, 5));
  });

  test("its strip stands 16 px under the photo's stage and 16 px clear of the screen's foot (DESIGN §7.2.4)", async ({
    page,
    viewport,
  }) => {
    await openCar(page, "en", FIVE);
    await slide(page, 1).click();
    await settled(page);
    // The stage the photo is fitted in, which the slide in view fills
    const stage = await slideInView(page).boundingBox();
    const thumbnail = await strip(page).first().boundingBox();
    expect((thumbnail?.y ?? 0) - ((stage?.y ?? 0) + (stage?.height ?? 0))).toBeCloseTo(16, 0);
    expect((viewport?.height ?? 0) - ((thumbnail?.y ?? 0) + (thumbnail?.height ?? 0))).toBeCloseTo(16, 0);
  });

  test("its strip is one tab stop, at the photo in view, which the arrow keys move", async ({ page }) => {
    await openCar(page, "en", FIVE);
    await slide(page, 2).click();
    await settled(page);
    await expect(strip(page).and(page.locator('[tabindex="-1"]'))).toHaveCount(4);
    await strip(page).nth(1).focus();
    await page.keyboard.press("ArrowRight");
    await expect(viewerCounter(page)).toHaveText("3 / 5");
    await expect(strip(page).nth(2)).toBeFocused();
  });

  test("Tab and Shift Tab leave its strip from its one tab stop, which the list that scrolls it is not (FR-10.3)", async ({
    page,
    browserName,
  }) => {
    // Eighteen thumbnails, more than the screen holds, so the list scrolls
    await openCar(page, "en", EIGHTEEN);
    await slide(page, 1).click();
    await settled(page);
    const list = viewer(page).getByRole("list");
    // Firefox makes a list that scrolls a tab stop of its own, before its first control, unless the
    // list says it isn't one. WebKit's Tab passes over links unless Alt is held, as Safari's does.
    const keys = [`Shift+${tabKey(browserName)}`, tabKey(browserName)];
    for (const key of keys) {
      await strip(page).first().focus();
      await page.keyboard.press(key);
      expect(await list.evaluate((element) => element.contains(document.activeElement)), key).toBe(false);
    }
  });

  test("its strip's arrow keys still go from thumbnail to thumbnail while the photo is zoomed", async ({ page }) => {
    await openCar(page, "en", FIVE);
    await slide(page, 2).click();
    await settled(page);
    await zoomButton(page, "en", "zoomIn").click();
    await expect.poll(() => shownScale(page)).toBeCloseTo(2, 2);
    await strip(page).nth(1).focus();
    await page.keyboard.press("ArrowRight");
    await expect(viewerCounter(page)).toHaveText("3 / 5");
    await expect(strip(page).nth(2)).toBeFocused();
    expect(await shownScale(page)).toBeCloseTo(1, 2);
  });

  test("its strip keeps the thumbnail of the photo in view in sight", async ({ page }) => {
    await openCar(page, "en", EIGHTEEN);
    await moreTile(page, "en", 12).click();
    await expect(viewerCounter(page)).toHaveText("7 / 18");
    await expect(strip(page).nth(17)).not.toBeInViewport();
    for (let press = 0; press < 11; press += 1) await page.keyboard.press("ArrowRight");
    await expect(viewerCounter(page)).toHaveText("18 / 18");
    await expect(strip(page).nth(17)).toBeInViewport();
  });

  test("its strip opens with the thumbnail of the photo in view in sight", async ({ page }) => {
    await openCar(page, "en", EIGHTEEN);
    await slide(page, 1).focus();
    for (let press = 0; press < 17; press += 1) await page.keyboard.press("ArrowRight");
    await expect(slide(page, 18)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(viewerCounter(page)).toHaveText("18 / 18");
    await expect(strip(page).nth(17)).toBeInViewport();
  });

  test("with 40 photos, its strip loads a thumbnail as it comes near it (FR-10's edge case)", async ({ page }) => {
    const files = watchPhotoFiles(page);
    await openCar(page, "en", FORTY);
    await moreTile(page, "en", 34).click();
    await expect(viewerCounter(page)).toHaveText("7 / 40");
    await expect(strip(page)).toHaveCount(40);
    await page.waitForTimeout(QUIET);
    expect(files()).not.toContainEqual(thumbnailFile(40));
    // Turned to its end with the wheel, which Firefox scrolls a page at most a turn. Stepping
    // the 33 photos there took most of the test's 30 s in WebKit under the whole suite's load
    // (D-049).
    const list = viewer(page).getByRole("list");
    await list.hover();
    await expect(async () => {
      await page.mouse.wheel(2000, 0);
      const left = await list.evaluate((element) => element.scrollWidth - element.clientWidth - element.scrollLeft);
      expect(left).toBeLessThan(1);
    }).toPass();
    await expect.poll(files).toContainEqual(thumbnailFile(40));
  });

  test("a mouse drag of a photo fitted whole brings in no other: a swipe is a finger's", async ({ page }) => {
    await openCar(page, "en", FIVE);
    await slide(page, 1).click();
    await settled(page);
    const start = await middleOf(page);
    await page.mouse.move(start.x + 150, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x - 150, start.y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(QUIET);
    await expect(viewerCounter(page)).toHaveText("1 / 5");
    expect((await middleOf(page)).x).toBeCloseTo(start.x, 0);
  });
});

test.describe("on a touch screen", () => {
  test.skip(({ hasTouch }) => !hasTouch, "a finger's gestures");

  test("a double tap zooms the photo to 2x about the point tapped, and another zooms it back out (FR-10.4)", async ({
    page,
  }) => {
    await openCar(page, "en", FIVE);
    await slide(page, 1).click();
    await settled(page);
    const middle = await middleOf(page);
    await page.touchscreen.tap(middle.x + 60, middle.y);
    await page.touchscreen.tap(middle.x + 60, middle.y);
    await expect.poll(() => shownScale(page)).toBeCloseTo(2, 2);
    // The point tapped stays under the finger, as the photo's middle goes as far the other way
    expect((await middleOf(page)).x - middle.x).toBeCloseTo(-60, 0);
    await page.touchscreen.tap(middle.x + 60, middle.y);
    await page.touchscreen.tap(middle.x + 60, middle.y);
    await expect.poll(() => shownScale(page)).toBeCloseTo(1, 2);
  });

  test("two fingers pinch the photo, about the point between them (FR-10.4)", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Chromium's DevTools protocol alone puts two fingers down at once");
    await openCar(page, "en", FIVE);
    await slide(page, 1).click();
    await settled(page);
    const middle = await middleOf(page);
    const cdp = await page.context().newCDPSession(page);
    // Two fingers about a point 40 px right of the photo's middle, from 80 px apart to 160
    const fingers = (apart: number) => [
      { id: 0, x: middle.x + 40 - apart / 2, y: middle.y },
      { id: 1, x: middle.x + 40 + apart / 2, y: middle.y },
    ];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: fingers(80) });
    for (const apart of [100, 120, 140, 160]) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: fingers(apart) });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => shownScale(page)).toBeCloseTo(2, 2);
    expect((await middleOf(page)).x - middle.x).toBeCloseTo(-40, 0);
  });

  test("a pinch that ends a hair from 1x glides to the photo fitted whole, as a double tap does (DESIGN §4.2)", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "Chromium's DevTools protocol alone puts two fingers down at once");
    await openCar(page, "en", FIVE);
    await slide(page, 1).click();
    await settled(page);
    const middle = await middleOf(page);
    const [x, y] = [Math.round(middle.x), Math.round(middle.y)];
    const cdp = await page.context().newCDPSession(page);
    const transitions = await recordTransitions(page);
    // From 200 px apart to 201: a scale of 1.005, short of a step, which settles at 1x as it is let
    // go
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { id: 0, x: x - 100, y },
        { id: 1, x: x + 100, y },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { id: 0, x: x - 100, y },
        { id: 1, x: x + 101, y },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => shownScale(page)).toBeCloseTo(1, 3);
    expect(await transitions()).toStrictEqual(["div transform"]);
  });

  test.describe("on Chromium's", () => {
    test.skip(({ browserName }) => browserName !== "chromium", "Chromium's DevTools protocol alone drags a finger");

    for (const locale of LOCALES) {
      test(`a swipe against the reading direction brings in the next photo, in ${locale} (FR-10.3)`, async ({
        page,
      }) => {
        await openCar(page, locale, FIVE);
        await slide(page, 1).click();
        await settled(page);
        const middle = await middleOf(page);
        // The next photo waits on the right in English and on the left in Arabic
        const onward = locale === "en" ? -1 : 1;
        await across(page, onward);
        await expect(viewerCounter(page)).toHaveText("2 / 5");
        await expect.poll(async () => (await middleOf(page)).x).toBeCloseTo(middle.x, 0);
        await across(page, onward === -1 ? 1 : -1);
        await expect(viewerCounter(page)).toHaveText("1 / 5");
      });
    }

    test("a short drag puts the photo back, and at the last photo a swipe on goes nowhere", async ({ page }) => {
      await openCar(page, "en", FIVE);
      await slide(page, 5).click();
      await expect(viewerCounter(page)).toHaveText("5 / 5");
      await settled(page);
      const middle = await middleOf(page);
      await across(page, -1);
      await expect.poll(async () => (await middleOf(page)).x).toBeCloseTo(middle.x, 0);
      await expect(viewerCounter(page)).toHaveText("5 / 5");
      await fingerDrag(page, { x: middle.x - 30, y: middle.y }, { x: middle.x + 30, y: middle.y });
      await expect.poll(async () => (await middleOf(page)).x).toBeCloseTo(middle.x, 0);
      await expect(viewerCounter(page)).toHaveText("5 / 5");
    });

    test("a swipe down closes the viewer, and the focus goes back to the photo that opened it", async ({ page }) => {
      await openCar(page, "en", FIVE);
      await slide(page, 1).click();
      await settled(page);
      const announcement = viewer(page).locator('[aria-live="polite"]');
      await control(page, "en", "next").click();
      await expect(announcement.locator("p")).toHaveCount(2);
      const middle = await middleOf(page);
      await fingerDrag(page, { x: middle.x, y: middle.y - 200 }, { x: middle.x, y: middle.y + 250 });
      await expect(viewer(page)).toBeHidden();
      await expect(slide(page, 1)).toBeFocused();
      // It closed as any close does: it opens again fitted whole, in its place, with nothing announced
      await slide(page, 2).click();
      await settled(page);
      await expect(viewerCounter(page)).toHaveText("2 / 5");
      await expect(announcement).toBeEmpty();
      expect(await shownScale(page)).toBeCloseTo(1, 2);
      expect((await middleOf(page)).y).toBeCloseTo(middle.y, 0);
    });

    test("a photo a swipe brings in is not announced (DESIGN §8.3)", async ({ page }) => {
      await openCar(page, "en", FIVE);
      await slide(page, 1).click();
      await settled(page);
      const announcement = viewer(page).locator('[aria-live="polite"]');
      await control(page, "en", "next").click();
      await expect(announcement.locator("p")).toHaveCount(2);
      await across(page, -1);
      await expect(viewerCounter(page)).toHaveText("3 / 5");
      await expect(announcement).toBeEmpty();
      // Back at the photo the button brought in, still with no announcement
      await across(page, 1);
      await expect(viewerCounter(page)).toHaveText("2 / 5");
      await expect(announcement).toBeEmpty();
    });

    test("one finger pans a zoomed photo, and brings in no other", async ({ page }) => {
      await openCar(page, "en", FIVE);
      await slide(page, 1).click();
      await settled(page);
      await zoomButton(page, "en", "zoomIn").click();
      await expect.poll(() => shownScale(page)).toBeCloseTo(2, 2);
      const middle = await middleOf(page);
      await fingerDrag(page, { x: middle.x + 60, y: middle.y }, { x: middle.x - 60, y: middle.y });
      await expect(viewerCounter(page)).toHaveText("1 / 5");
      expect((await middleOf(page)).x - middle.x).toBeCloseTo(-120, 0);
    });
  });
});

for (const locale of LOCALES) {
  test(`the viewer has no serious axe issue in ${locale}`, async ({ page }) => {
    await openCar(page, locale, FIVE);
    await slide(page, 2).click();
    await expect(viewerCounter(page)).toHaveText("2 / 5");
    await settled(page);
    expect(await seriousA11yIssues(page)).toStrictEqual([]);
  });
}
