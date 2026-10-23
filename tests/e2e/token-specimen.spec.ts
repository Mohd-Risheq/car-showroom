import { readFileSync } from "node:fs";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { SPECIMEN_COPY } from "../../src/app/_dev/specimen/copy.ts";
import { CSS_MOTION_VARIABLES, DURATIONS, PRESS_SCALE, SPRINGS } from "../../src/lib/motion-tokens.ts";
import { tokenBlocks } from "../../src/styles/token-blocks.ts";
import { seriousA11yIssues } from "../support/axe.ts";
import { watchProblems } from "../support/page-problems.ts";
import { computed, emulateContrast, openSpecimen, outlineOf } from "../support/specimen.ts";

// The token specimens of T-13 (/[locale]/dev/tokens and /[locale]/dealer/dev/tokens): they show every
// token the stylesheets declare, the workspace themes, and the base controls under the preferences
// DESIGN §4.5 answers, with no policy violation, error or serious axe issue.

const PAGES = ["/en/dev/tokens", "/ar/dev/tokens", "/en/dealer/dev/tokens", "/ar/dealer/dev/tokens"];

const NUMBER = String.raw`-?(?:\d+\.?\d*|\.\d+)`;
const TIME_OR_NUMBER = new RegExp(`^(${NUMBER})(ms|s)?$`);
const CURVE = new RegExp(`^cubic-bezier\\((${NUMBER}), ?(${NUMBER}), ?(${NUMBER}), ?(${NUMBER})\\)$`);

/**
 * The numbers in a motion value as CSS writes it, a time in milliseconds: one for a time or a
 * number, four for a curve. The build may write 200ms as .2s, so the text alone can't be compared.
 */
function numbers(text: string): number[] {
  const time = TIME_OR_NUMBER.exec(text.trim());
  // To the microsecond, as 1.001s times 1000 is 1000.9999999999999
  if (time?.[1]) return [Math.round(Number(time[1]) * (time[2] === "s" ? 1e6 : 1e3)) / 1e3];
  const curve = CURVE.exec(text.trim());
  if (curve) return curve.slice(1).map(Number);
  throw new Error(`not a CSS time, number or curve: "${text}"`);
}

/** A custom property as the browser computes it on <html> */
async function token(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (property) => getComputedStyle(document.documentElement).getPropertyValue(property).trim(),
    name,
  );
}

test("the stylesheet's motion values are motion-tokens.ts's, as the browser reads them", async ({ page }) => {
  await page.goto("/en/dev/tokens");
  const computed: Record<string, number[]> = {};
  for (const [variable] of CSS_MOTION_VARIABLES) computed[variable] = numbers(await token(page, variable));
  expect(computed).toStrictEqual(
    Object.fromEntries(CSS_MOTION_VARIABLES.map(([variable, value]) => [variable, numbers(value)])),
  );
});

test("shows the motion tokens that Motion and GSAP take, which no CSS variable mirrors", async ({ page }) => {
  await page.goto("/en/dev/tokens");
  for (const name of [...Object.keys(SPRINGS).map((spring) => `SPRINGS.${spring}`), "TRACK_SPRING", "SCRUB_CATCH_UP"]) {
    await expect(page.getByText(name, { exact: true }), name).toBeVisible();
  }
});

test("lists every custom property tokens.css declares outside the Tailwind theme", async ({ page }) => {
  const { blocks } = tokenBlocks(readFileSync(new URL("../../src/styles/tokens.css", import.meta.url), "utf8"));
  const declared = new Set(
    [...blocks].filter(([block]) => !block.startsWith("@theme")).flatMap(([, tokens]) => [...tokens.keys()]),
  );
  await page.goto("/en/dev/tokens");
  // The list reads the stylesheets once the page has hydrated
  await expect(page.locator("[data-token-count]")).toBeVisible();
  const listed = new Set(
    await page.locator("[data-token]").evaluateAll((rows) => rows.map((row) => row.dataset.token)),
  );
  expect([...declared].filter((name) => !listed.has(name))).toStrictEqual([]);
  // And the theme variables components read through Tailwind. Tailwind writes the colour classes
  // (@theme inline) and the shadow classes with the values themselves, so those variables aren't in
  // the stylesheet.
  for (const name of ["--spacing-page", "--ease-out", "--radius-input"]) {
    expect(listed.has(name), name).toBe(true);
  }
});

for (const path of PAGES) {
  test(`${path} loads and works with no policy violation, page error or console error`, async ({ page }) => {
    const problems = await watchProblems(page);
    await page.goto(path);
    // Discouraged as a readiness wait, but here it gives late load errors time to surface, as in
    // smoke.spec.ts; the clicks below wait for what they change
    await page.waitForLoadState("networkidle");
    const workspace = path.includes("/dealer/");
    const en = path.startsWith("/en/");
    if (workspace) await page.getByRole("button", { name: en ? "Dark" : "الداكن" }).click();
    await page.getByRole("button", { name: en ? "Filters" : "الفلاتر", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: en ? "Show a toast" : "اعرض إشعاراً", exact: true }).click();
    await expect(page.getByRole("region", { name: en ? "Notifications" : "الإشعارات" })).toContainText(
      en ? "Link copied" : "تم نسخ الرابط",
    );
    expect(problems).toStrictEqual([]);
    expect(await page.evaluate(() => window.policyViolations)).toStrictEqual([]);
  });

  test(`${path} has no serious or critical axe issue, with its sheet closed and open`, async ({ page }) => {
    await page.goto(path);
    expect(await seriousA11yIssues(page)).toStrictEqual([]);
    await page.getByRole("button", { name: path.startsWith("/en/") ? "Filters" : "الفلاتر", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await seriousA11yIssues(page)).toStrictEqual([]);
  });
}

test("the workspace opens in Daylight, and keeps the dark theme once it is chosen", async ({ page }) => {
  const root = page.locator("html");
  const themeColour = page.locator('meta[name="theme-color"]');
  const background = page.locator('[data-colour="bg"] [data-measure]');
  await page.goto("/en/dealer/dev/tokens");
  await expect(root).toHaveAttribute("data-theme", "daylight");
  await expect(page.getByRole("button", { name: "Daylight" })).toHaveAttribute("aria-pressed", "true");
  await expect(themeColour).toHaveAttribute("content", "#f3f5f7");
  await expect(background).toHaveText("#f3f5f7");

  await page.getByRole("button", { name: "Dark" }).click();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
  await expect(themeColour).toHaveAttribute("content", "#0b0d10");
  await expect(background).toHaveText("#0b0d10");

  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(themeColour).toHaveAttribute("content", "#0b0d10");
  await expect(background).toHaveText("#0b0d10");
});

test("the browser's theme colour stays on the theme when the theme-color meta is replaced or rewritten", async ({
  page,
}) => {
  // As Next.js does on every client-side navigation, with the layout's Daylight colour
  const themeColour = page.locator('meta[name="theme-color"]');
  await page.goto("/en/dealer/dev/tokens");
  await page.getByRole("button", { name: "Dark" }).click();
  await expect(themeColour).toHaveAttribute("content", "#0b0d10");

  await themeColour.evaluate((meta) => {
    const replacement = document.createElement("meta");
    replacement.name = "theme-color";
    replacement.content = "#f3f5f7";
    meta.replaceWith(replacement);
  });
  await expect(themeColour).toHaveAttribute("content", "#0b0d10");

  await themeColour.evaluate((meta) => meta.setAttribute("content", "#f3f5f7"));
  await expect(themeColour).toHaveAttribute("content", "#0b0d10");
});

test("a toast shows in a polite region named for it, and its one action runs and closes it", async ({ page }) => {
  await page.goto("/en/dev/tokens");
  await page.getByRole("button", { name: "Show a toast with a retry" }).click();
  const region = page.getByRole("region", { name: "Notifications" });
  await expect(region).toHaveAttribute("aria-live", "polite");
  await expect(region.getByText("The draft wasn't saved.")).toBeVisible();
  await region.getByRole("button", { name: "Retry" }).click();
  await expect(region.getByText("The draft is saved.")).toBeVisible();
  await expect(region.getByText("The draft wasn't saved.")).toHaveCount(0);
});

test("toasts take the page's direction", async ({ page }) => {
  await page.goto("/ar/dev/tokens");
  await page.getByRole("button", { name: "اعرض إشعاراً", exact: true }).click();
  await expect(page.locator("[data-sonner-toaster]")).toHaveAttribute("dir", "rtl");
});

test("under reduced motion a toast fades over 200 ms rather than sliding", async ({ page }) => {
  await page.goto("/en/dev/tokens");
  await page.getByRole("button", { name: "Show a toast", exact: true }).click();
  const toast = page.locator("[data-sonner-toast]").first();
  await expect(toast).toBeVisible();
  const transition = () =>
    toast.evaluate((node) => [getComputedStyle(node).transitionProperty, getComputedStyle(node).transitionDuration]);
  // Sonner's own slide, with no preference
  expect((await transition())[0]).toContain("transform");

  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await transition()).toStrictEqual(["opacity", "0.2s"]);
});

test("m animates inside MotionFeatures once Motion's features arrive", async ({ page }) => {
  const problems = await watchProblems(page);
  await page.goto("/en/dev/tokens");
  const bar = page.locator("[data-spring-bar]");
  const scale = () => bar.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).a);
  expect(await scale()).toBeCloseTo(0.25, 2);
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await expect.poll(scale).toBeCloseTo(1, 2);
  expect(problems).toStrictEqual([]);
});

test("under increased contrast, text takes ink, lines gain contrast and surfaces get an edge", async ({ page }) => {
  await page.goto("/en/dev/tokens");
  const edge = page.locator(".surface-edge").first();
  // No edge with no preference
  expect(await edge.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe("none");

  await emulateContrast(page, "more");
  const ink = await token(page, "--ink");
  expect(await token(page, "--muted")).toBe(ink);
  expect(await token(page, "--meta")).toBe(ink);
  expect(await token(page, "--line")).toBe("#8a9ab0");
  expect(await edge.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe("solid");

  await page.goto("/en/dealer/dev/tokens");
  expect(await token(page, "--line")).toBe("#5e6a7a");
});

test("under reduced transparency the placard turns opaque", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "only Chromium's DevTools protocol emulates prefers-reduced-transparency");
  const placard = page.locator("[data-placard]");
  const alpha = () =>
    placard.evaluate((node) => /\/ ([\d.]+)\)$/.exec(getComputedStyle(node).backgroundColor)?.[1] ?? "1");
  await page.goto("/en/dev/tokens");
  expect(await token(page, "--placard-opacity")).toBe("92%");
  expect(await alpha()).toBe("0.92");

  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
  });
  expect(await token(page, "--placard-opacity")).toBe("100%");
  expect(await alpha()).toBe("1");
  await expect(placard.locator("[data-measure]")).toContainText("100%");
});

test("the specimen's readouts follow the window's width", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/en/dev/tokens");
  const display = page.locator('[data-step="display"] [data-measure]');
  await expect(display).toContainText('"HEXP" 100');
  await page.setViewportSize({ width: 400, height: 900 });
  await expect(display).toContainText('"HEXP" 60');
});

test("the specimen's readouts follow a contrast preference changed after load", async ({ page, browserName }) => {
  test.skip(
    browserName === "firefox",
    "Firefox as Playwright drives it neither restyles an open page nor tells it when the emulated contrast changes",
  );
  await openSpecimen(page);
  const line = page.locator('[data-colour="line"] [data-measure]');
  await expect(line).not.toHaveText("#8a9ab0");
  await page.emulateMedia({ contrast: "more" });
  await expect(line).toHaveText("#8a9ab0");
});

test("the front toast shows the list's focus ring, then its own when Tab reaches it", async ({ page, browserName }) => {
  // Safari moves to list items and buttons with Option-Tab, as Full Keyboard Access does with Tab
  const tab = browserName === "webkit" ? "Alt+Tab" : "Tab";
  await openSpecimen(page);
  // A keyboard user shows the toast with Enter. Where a script moves focus, as Sonner's hotkey does,
  // browsers draw the ring only if the focus it left had one, and Alt+T alone doesn't count as
  // keyboard use.
  await page.getByRole("button", { name: "Show a toast", exact: true }).focus();
  await page.keyboard.press("Enter");
  const toaster = page.locator("[data-sonner-toaster]");
  const toast = page.locator('[data-sonner-toast][data-front="true"]');
  await expect(toast).toBeVisible();
  const ring = ["solid", "2px", await computed(page, "color", "var(--accent)")];

  // Sonner's hotkey takes focus to the list. Its toasts are positioned, so the list has no height of
  // its own, and a ring on it would be a flat bar under them.
  await page.keyboard.press("Alt+KeyT");
  await expect(toaster).toBeFocused();
  expect((await toaster.boundingBox())?.height).toBe(0);
  expect((await outlineOf(toaster))[0]).toBe("none");
  expect(await outlineOf(toast)).toStrictEqual(ring);
  await page.keyboard.press(tab);
  await expect(toast).toBeFocused();
  expect(await outlineOf(toast)).toStrictEqual(ring);
});

test("a disabled button stays in the tab order and says it is disabled", async ({ page, browserName }) => {
  const tab = browserName === "webkit" ? "Alt+Tab" : "Tab";
  await openSpecimen(page);
  // The icon-only Share button comes just before it
  await page.getByRole("button", { name: "Share", exact: true }).last().focus();
  await page.keyboard.press(tab);
  const sold = page.getByRole("button", { name: "Sold", exact: true });
  await expect(sold).toBeFocused();
  await expect(sold).toHaveAttribute("aria-disabled", "true");
});

/**
 * Holds a button down with the space bar or the pointer: whether it is :active, and its scale once
 * the press has had time to land
 */
async function hold(page: Page, button: Locator, press: "keyboard" | "pointer") {
  if (press === "keyboard") {
    await page.keyboard.down("Space");
  } else {
    await button.hover();
    await page.mouse.down();
  }
  await page.waitForTimeout(DURATIONS.press + 100);
  const held = await button.evaluate((node) => ({
    active: node.matches(":active"),
    scale: new DOMMatrix(getComputedStyle(node).transform).a,
  }));
  if (press === "keyboard") await page.keyboard.up("Space");
  else await page.mouse.up();
  return held;
}

test("a pointer press scales a button, in the workspace too", async ({ page }) => {
  for (const path of ["/en/dealer/dev/tokens", "/en/dev/tokens"]) {
    await openSpecimen(page, path);
    const { active, scale } = await hold(page, page.getByRole("button", { name: "Compare", exact: true }), "pointer");
    expect(active, path).toBe(true);
    expect(scale, path).toBeCloseTo(PRESS_SCALE, 2);
  }
});

test("a press with the space bar scales a button, apart from in the workspace", async ({ page, browserName }) => {
  test.skip(
    browserName === "firefox",
    "Firefox as Playwright drives it doesn't make a button held with the space bar :active",
  );
  const tab = browserName === "webkit" ? "Alt+Tab" : "Tab";
  // DESIGN §4.1: no motion on keyboard-triggered actions in the workspace; §6.4's press scale elsewhere
  for (const [path, keyboardScale] of [
    ["/en/dealer/dev/tokens", 1],
    ["/en/dev/tokens", PRESS_SCALE],
  ] as const) {
    await openSpecimen(page, path);
    const compare = page.getByRole("button", { name: "Compare", exact: true });
    // From the button before it, by keyboard
    await page.getByRole("button", { name: "Book a viewing", exact: true }).focus();
    await page.keyboard.press(tab);
    await expect(compare).toBeFocused();
    const { active, scale } = await hold(page, compare, "keyboard");
    expect(active, path).toBe(true);
    expect(scale, path).toBeCloseTo(keyboardScale, 2);
  }
});

test("under reduced motion m jumps to where it would move", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openSpecimen(page);
  const bar = page.locator("[data-spring-bar]");
  const scale = () => bar.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).a);
  // Once Motion's features have arrived, the bar ends its first move
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await expect.poll(scale).toBeCloseTo(1, 2);

  // The bar's scale on every frame of the move back
  const frames = await bar.evaluate(async (node) => {
    const move = [...document.querySelectorAll("button")].find((button) => button.textContent === "Move");
    if (!move) throw new Error("the specimen has no Move button");
    move.click();
    const scales: number[] = [];
    const start = performance.now();
    while (performance.now() - start < 400) {
      await new Promise(requestAnimationFrame);
      scales.push(new DOMMatrix(getComputedStyle(node).transform).a);
    }
    return scales;
  });
  expect(frames.filter((value) => value > 0.26 && value < 0.99)).toStrictEqual([]);
  expect(frames.at(-1)).toBeCloseTo(0.25, 2);
});

test("a field names its error before its hint, and keeps the check at the end of a left-to-right value", async ({
  page,
}) => {
  await openSpecimen(page);
  const invalid = page.locator('input[aria-invalid="true"]');
  const [first, second] = ((await invalid.getAttribute("aria-describedby")) ?? "").split(" ");
  await expect(page.locator(`[id="${first}"]`)).toHaveText(SPECIMEN_COPY.en.vinError);
  await expect(page.locator(`[id="${second}"]`)).toHaveText(SPECIMEN_COPY.en.vinHint);
  // The valid field's control names the message the check stands for
  const valid = page.locator('input[value="1HGCV3F18JA518032"]');
  const [message] = ((await valid.getAttribute("aria-describedby")) ?? "").split(" ");
  await expect(page.locator(`[id="${message}"]`)).toHaveText(SPECIMEN_COPY.en.vinValid);

  // In Arabic the VIN still reads left to right, so the check sits on the right
  await openSpecimen(page, "/ar/dev/tokens");
  const box = await valid.boundingBox();
  const check = await valid.locator("xpath=following-sibling::*[local-name()='svg']").boundingBox();
  if (!box || !check) throw new Error("the valid field or its check is not on the page");
  expect(check.x).toBeGreaterThan(box.x + box.width / 2);
});

test("on a phone the sheet's title and a field's hint and error take the public steps, and the workspace's scale there", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fontSize = (element: Locator) => element.evaluate((node) => getComputedStyle(node).fontSize);
  /** The size, line height and weight an element's text takes */
  const typeOf = (element: Locator) =>
    element.evaluate((node) => {
      const { fontSize, lineHeight, fontWeight } = getComputedStyle(node);
      return { fontSize, lineHeight, fontWeight };
    });
  const hint = page.getByText(SPECIMEN_COPY.en.vinHint).first();
  const error = page.getByText(SPECIMEN_COPY.en.vinError);
  const title = page.getByRole("dialog").getByRole("heading");
  const filters = page.getByRole("button", { name: "Filters", exact: true });

  await openSpecimen(page);
  const small = await typeOf(page.locator('[data-step="small"] p'));
  expect(await typeOf(hint)).toStrictEqual(small);
  expect(await typeOf(error)).toStrictEqual(small);
  await filters.click();
  // The lead step's own weight too, DESIGN §3.3's 400
  expect(await typeOf(title)).toStrictEqual(await typeOf(page.locator('[data-step="lead"] p')));

  await openSpecimen(page, "/en/dealer/dev/tokens");
  const workspaceSmall = await computed(page, "font-size", "var(--text-sm)");
  expect(await fontSize(hint)).toBe(workspaceSmall);
  expect(await fontSize(error)).toBe(workspaceSmall);
  await filters.click();
  expect(await fontSize(title)).toBe(await computed(page, "font-size", "var(--text-lg)"));
  expect((await typeOf(title)).fontWeight).toBe("600");
});
