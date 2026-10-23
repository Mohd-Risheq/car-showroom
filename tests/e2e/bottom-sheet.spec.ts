import { expect, type Locator, type Page, test } from "@playwright/test";
import { FLICK_SPEED, projection, rubberBand, VELOCITY_WINDOW } from "../../src/components/ui/sheet-gesture.ts";
import { computed, emulateContrast, openSpecimen, outlineOf } from "../support/specimen.ts";

// DESIGN §6.1's draggable bottom sheet (src/components/ui/bottom-sheet.tsx), on the token specimen,
// where it has the filter sheet's shape: a modal dialog named by its title, which takes focus, traps
// it and gives it back; closed by Escape, a tap outside, its close button or a flick; grabbable
// mid-flight; instant from the keyboard; a fade under reduced motion (DESIGN §4.1, §4.5, §8.1, §8.4).
// Pointer events take their times from a clock the tests move, one frame per event, since a busy
// machine can space Playwright's moves further apart than the release's velocity window.

const SPECIMEN = "/en/dev/tokens";

/** How long a finger rests before letting go: past the velocity window, so the release has no speed */
const REST = VELOCITY_WINDOW + 50;

/** The time between one pointer event and the next, in ms, unless the finger rests */
const FRAME = 16;

declare global {
  interface Window {
    /** Every Web Animations call, in order: the element's role and the keyframes */
    sheetAnimations: Array<{ role: string | null; keyframes: string }>;
    /** Pauses the sheet's next animations as they start, so a test can catch the sheet mid-flight */
    holdSheet: boolean;
    /** The time of the last pointer event, in ms */
    pointerClock: number;
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((frame) => {
    window.sheetAnimations = [];
    window.holdSheet = false;
    // Above 0, since React takes a time of 0 as missing and uses Date.now() instead
    window.pointerClock = 1000;
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
      // Captured on the window, so the time is set before anything else hears the event
      window.addEventListener(
        type,
        (event) => {
          window.pointerClock += frame;
          Object.defineProperty(event, "timeStamp", { value: window.pointerClock });
        },
        true,
      );
    }
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, keyframes, options) {
      const role = this.getAttribute("role");
      window.sheetAnimations.push({ role, keyframes: JSON.stringify(keyframes) });
      const animation = animate.call(this, keyframes, options);
      if (window.holdSheet && (role === "dialog" || role === "presentation")) animation.pause();
      return animation;
    };
  }, FRAME);
});

function sheetOf(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Filters" });
  return {
    trigger: page.getByRole("button", { name: "Filters", exact: true }),
    dialog,
    title: dialog.getByRole("heading", { name: "Filters" }),
  };
}

/** Resolves once the element's animations have ended */
async function settled(element: Locator): Promise<void> {
  await element.evaluate((node) => Promise.all(node.getAnimations().map((animation) => animation.finished)));
}

async function top(element: Locator): Promise<number> {
  const box = await element.boundingBox();
  if (!box) throw new Error("the element is not on the page");
  return box.y;
}

/** The sheet's keyframes so far: what each of its animations moved */
async function sheetKeyframes(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    window.sheetAnimations.filter(({ role }) => role === "dialog").map(({ keyframes }) => keyframes),
  );
}

/** Opens the sheet with a click and waits for it to arrive; returns its open top and height */
async function openSheet(page: Page): Promise<{ open: number; height: number }> {
  const { trigger, dialog } = sheetOf(page);
  await page.goto(SPECIMEN);
  await trigger.click();
  await expect(dialog).toBeVisible();
  await settled(dialog);
  const box = await dialog.boundingBox();
  if (!box) throw new Error("the sheet is not on the page");
  return { open: box.y, height: box.height };
}

/** The middle of an element, in whole pixels, as pointer events report them */
async function centreOf(element: Locator): Promise<{ x: number; y: number }> {
  const box = await element.boundingBox();
  if (!box) throw new Error("the element is not on the page");
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

/** Presses on the handle and moves `distance` px down (up when negative), in `steps` moves */
async function dragBy(page: Page, handle: Locator, distance: number, { steps = 8 } = {}) {
  const { x, y } = await centreOf(handle);
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let step = 1; step <= steps; step++) await page.mouse.move(x, y + (distance * step) / steps);
}

/** Holds the pointer still past the velocity window, so the release that follows has no speed */
async function rest(page: Page): Promise<void> {
  await page.evaluate((ms) => {
    window.pointerClock += ms;
  }, REST);
}

test("opens from its trigger as a modal dialog named by its title, which takes focus", async ({ page }) => {
  const { trigger, dialog, title } = sheetOf(page);
  await page.goto(SPECIMEN);
  await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "Compare" })).toHaveCount(1);

  await trigger.click();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(title).toBeFocused();
  // The page behind is out of reach of assistive technology while the sheet is open
  await expect(page.getByRole("button", { name: "Compare" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Filters", exact: true, includeHidden: true })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});

test("keeps focus inside while it is open", async ({ page, browserName }) => {
  const { dialog } = sheetOf(page);
  await openSheet(page);
  // Safari moves to buttons with Option-Tab, as Full Keyboard Access does with Tab
  const tab = browserName === "webkit" ? "Alt+Tab" : "Tab";
  for (let press = 0; press < 4; press++) {
    await page.keyboard.press(tab);
    // Base UI's focus guards hand focus back inside on the next frame
    await expect.poll(() => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
});

const CLOSERS: Record<string, (page: Page, dialog: Locator) => Promise<void>> = {
  Escape: (page) => page.keyboard.press("Escape"),
  "a tap outside": (page) => page.mouse.click(8, 8),
  "its close button": (_page, dialog) => dialog.getByRole("button", { name: "Close" }).click(),
  "its own action": (_page, dialog) => dialog.getByRole("button", { name: "Show 18 cars" }).click(),
};

for (const [closer, close] of Object.entries(CLOSERS)) {
  test(`closes on ${closer}, and gives focus back to its trigger`, async ({ page }) => {
    const { trigger, dialog } = sheetOf(page);
    await openSheet(page);
    await close(page, dialog);
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
}

test("follows a drag, and settles back when let go above half its height with no speed", async ({ page }) => {
  const { dialog, title } = sheetOf(page);
  const { open } = await openSheet(page);
  await dragBy(page, title, 120);
  await rest(page);
  expect(await top(dialog)).toBeCloseTo(open + 120, 0);

  await page.mouse.up();
  await settled(dialog);
  expect(await top(dialog)).toBeCloseTo(open, 0);
  await expect(dialog).toBeVisible();
});

test("closes on a downward flick, however short", async ({ page }) => {
  const { trigger, dialog, title } = sheetOf(page);
  const { height } = await openSheet(page);
  // 24 px in four frames: faster than a flick, while the distance it would carry the sheet stays
  // short of half its height, so only its speed can close it
  const flick = { distance: 24, steps: 4 };
  const speed = (flick.distance / (flick.steps * FRAME)) * 1000;
  expect(speed).toBeGreaterThan(FLICK_SPEED);
  expect(flick.distance + projection(speed)).toBeLessThan(height / 2);
  // Let go one frame after the last move: a release that comes after a rest has no speed
  await dragBy(page, title, flick.distance, { steps: flick.steps });
  await page.mouse.up();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("closes when let go past half its height, even with no speed", async ({ page }) => {
  const { dialog, title } = sheetOf(page);
  const { height } = await openSheet(page);
  await dragBy(page, title, height * 0.6, { steps: 12 });
  await rest(page);
  await page.mouse.up();
  await expect(dialog).toHaveCount(0);
});

test("gives less the further it is pulled above its place, and returns", async ({ page }) => {
  const { dialog, title } = sheetOf(page);
  const { open, height } = await openSheet(page);
  // Up to 200 px, with the pointer kept on the page: Firefox as Playwright drives it reports a pointer
  // above the page in the wrong place
  const pull = Math.min(200, (await centreOf(title)).y - 1);
  await dragBy(page, title, -pull, { steps: 10 });
  await rest(page);
  expect(open - (await top(dialog))).toBeCloseTo(rubberBand(pull, height), 0);

  await page.mouse.up();
  await settled(dialog);
  expect(await top(dialog)).toBeCloseTo(open, 0);
});

test("a press on its close button is a press, not a drag", async ({ page }) => {
  const { dialog } = sheetOf(page);
  const { open } = await openSheet(page);
  const close = dialog.getByRole("button", { name: "Close" });
  await dragBy(page, close, 120);
  expect(await top(dialog)).toBeCloseTo(open, 0);
  await page.mouse.up();
});

test("can be caught mid-flight, where it is on screen", async ({ page }) => {
  const { trigger, dialog, title } = sheetOf(page);
  await page.goto(SPECIMEN);
  await page.evaluate(() => {
    window.holdSheet = true;
  });
  await trigger.click();
  await expect(dialog).toBeVisible();
  // Most of the way up: the release below doesn't pass half its height
  await dialog.evaluate((node) => {
    for (const animation of node.getAnimations()) animation.currentTime = 200;
  });
  const before = await top(dialog);
  const box = await dialog.boundingBox();
  if (!box) throw new Error("the sheet is not on the page");
  const opensAt = (page.viewportSize()?.height ?? 0) - box.height;
  expect(before).toBeGreaterThan(opensAt + 1);

  await dragBy(page, title, 0, { steps: 1 });
  expect(await dialog.evaluate((node) => node.getAnimations().length)).toBe(0);
  expect(await top(dialog)).toBeCloseTo(before, 0);

  await page.evaluate(() => {
    window.holdSheet = false;
  });
  await page.mouse.up();
  await settled(dialog);
  expect(await top(dialog)).toBeCloseTo(opensAt, 0);
});

test("opens and closes at once from the keyboard", async ({ page }) => {
  const { trigger, dialog, title } = sheetOf(page);
  await page.goto(SPECIMEN);
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(title).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await sheetKeyframes(page)).toStrictEqual([]);
});

test("opens at once on a click that counts no presses, as a key makes, after a pointer", async ({ page }) => {
  const { trigger, title } = sheetOf(page);
  await openSpecimen(page, SPECIMEN);
  // The page's last input is a pointer, so only the click itself says that no press made it
  await page.mouse.click(1, 1);
  await trigger.evaluate((node) => {
    if (node instanceof HTMLElement) node.click();
  });
  await expect(title).toBeFocused();
  expect(await sheetKeyframes(page)).toStrictEqual([]);
});

test("slides up from below the screen when opened by a tap", async ({ page }) => {
  const { height } = await openSheet(page);
  const [opening, ...rest] = await sheetKeyframes(page);
  expect(rest).toStrictEqual([]);
  const { translate, opacity } = JSON.parse(opening ?? "{}") as { translate: string[]; opacity: number[] };
  expect(opacity).toStrictEqual([1, 1]);
  expect(translate[1]).toBe("0 0px");
  // From its own height below its place, which the sheet reads in whole pixels
  const start = Number(/^0 ([\d.]+)px$/.exec(translate[0] ?? "")?.[1]);
  expect(Math.abs(start - height)).toBeLessThanOrEqual(1);
});

test("fades in place under reduced motion, opening and closing", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { dialog } = sheetOf(page);
  await openSheet(page);
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);
  expect(await sheetKeyframes(page)).toStrictEqual([
    JSON.stringify({ translate: ["0 0px", "0 0px"], opacity: [0, 1] }),
    JSON.stringify({ translate: ["0 0px", "0 0px"], opacity: [1, 0] }),
  ]);
});

test("keeps the page behind from scrolling while it is open", async ({ page, isMobile, browserName }) => {
  test.skip(isMobile && browserName === "webkit", "Playwright's mobile WebKit has no wheel events");
  const { dialog } = sheetOf(page);
  await openSheet(page);
  // The trigger is far down the page, so there is room to scroll back up
  const scrolled = await page.evaluate(() => window.scrollY);
  expect(scrolled).toBeGreaterThan(0);
  await page.mouse.move(8, 8);
  await page.mouse.wheel(0, -400);
  // A wheel scroll can land a few frames later
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);

  // The same wheel scrolls the page once the sheet has gone and its lock is lifted
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(async () => {
      await page.mouse.wheel(0, -400);
      return page.evaluate(() => window.scrollY);
    })
    .toBeLessThan(scrolled);
});

test("in Arabic, is named in Arabic and has its close button at the end of its header", async ({ page }) => {
  await page.goto("/ar/dev/tokens");
  await page.getByRole("button", { name: "الفلاتر", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "الفلاتر" });
  await expect(dialog.getByRole("heading", { name: "الفلاتر" })).toBeFocused();
  const close = await dialog.getByRole("button", { name: "إغلاق" }).boundingBox();
  const title = await dialog.getByRole("heading", { name: "الفلاتر" }).boundingBox();
  expect(close && title && close.x < title.x).toBe(true);
});

test("ends a drag when the sheet closes during it, so the next sheet doesn't follow the pointer", async ({ page }) => {
  const { trigger, dialog, title } = sheetOf(page);
  await openSheet(page);
  await dragBy(page, title, 60);
  await page.keyboard.press("Escape");
  // Gone before the release, so the old sheet never hears the pointer come up
  await expect(dialog).toHaveCount(0);
  await page.mouse.up();

  await trigger.click();
  await settled(dialog);
  const open = await top(dialog);
  const { x, y } = await centreOf(title);
  // Over the header with no button down
  await page.mouse.move(x, y);
  await page.mouse.move(x, y + 80, { steps: 4 });
  expect(await top(dialog)).toBeCloseTo(open, 0);
});

test("keeps the focus ring on the sheet itself under increased contrast, which gives surfaces an edge", async ({
  page,
}) => {
  const { trigger, dialog } = sheetOf(page);
  await page.goto(SPECIMEN);
  await emulateContrast(page, "more");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  // The edge, while its title has focus
  expect(await outlineOf(dialog)).toStrictEqual(["solid", "1px", await computed(page, "color", "var(--line)")]);
  // As Base UI does when the focused element inside the sheet goes
  await dialog.evaluate((node) => node.focus());
  await expect(dialog).toBeFocused();
  expect(await outlineOf(dialog)).toStrictEqual(["solid", "2px", await computed(page, "color", "var(--accent)")]);
});
