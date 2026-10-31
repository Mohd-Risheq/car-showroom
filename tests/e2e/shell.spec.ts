import { readFileSync } from "node:fs";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { IntlMessageFormat } from "intl-messageformat";
import { GARAGE_STORAGE_KEY } from "../../src/features/garage/domain/stored-count.ts";
import { INTL_LOCALE } from "../../src/lib/i18n/intl-locale.ts";
import { directionOf, otherLocale } from "../../src/lib/i18n/locales.ts";
import { seriousA11yIssues } from "../support/axe.ts";
import { expectProblems, watchProblems } from "../support/page-problems.ts";
import { computed, emulateContrast } from "../support/specimen.ts";

// FR-02's public shell in the browser (DESIGN §7.1.1, §8.4): the skip link (TC-02-1), the demo
// banner (FR-02.3, TC-02-3), the phone menu (FR-02.7, TC-02-4), the header's wordmark, compaction and
// short screens, a navigation's focus move and scroll (FR-02.4 to FR-02.6), the offline toast, a car
// page's action bar (FR-02.2, TC-02-2), tried on the shell lab, /[locale]/dev/shell, until T-21
// places it, the English offer with the shell's header (FR-01.2a), and the segment error of a page
// that fails (SRS §13.3).

type Catalog = {
  common: { skip: string; hide: string; notifications: string; offline: string; retry: string };
  demo: { bannerLabel: string; tag: string };
  errors: { notFound: { title: string }; segment: string };
  nav: { menu: string; cars: string; compare: string; garage: string; garageLabel: string };
  locale: { prompt: { text: string; stay: string } };
};
const catalog = (locale: "ar" | "en") => JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as Catalog;
const CATALOGS = { ar: catalog("ar"), en: catalog("en") };
const LOCALES = ["ar", "en"] as const;

const LAB = "/dev/shell";
/** Below this width the header folds its links into the menu (FR-02.7) */
const MENU_BELOW = 768;
/** Below this width a car page has its action bar (FR-02.2) */
const BAR_BELOW = 1024;
/** DESIGN §8.4: all sticky chrome together covers at most a quarter of the screen's height */
const STICKY_BUDGET = 0.25;
/** Q-12: the demo's number as the footer shows it (footer-contacts.ts) */
const DEMO_NUMBER = "+962 7X XXX XXXX";
/** The mark in session storage that makes the lab's failing page fail (dev/shell/failing) */
const FAIL_KEY = "muftah:fail";

declare global {
  interface Window {
    /** Whether the demo banner was ever painted while the page loaded */
    bannerShown: boolean;
    /** Each text the shell's route announcer took */
    announced: string[];
    /** Each element that took the focus, and whether the page was hidden from assistive technology then */
    focused: { name: string; hidden: boolean }[];
    /** Each part of the header that began to move by a transition: the band or its row */
    moved: string[];
  }
}

const widthOf = (page: Page) => page.viewportSize()?.width ?? 0;
// Safari moves to links and buttons with Option-Tab, as Full Keyboard Access does with Tab
const tabKey = (browserName: string) => (browserName === "webkit" ? "Alt+Tab" : "Tab");
const scrollTop = (page: Page) => page.evaluate(() => window.scrollY);
const scrollPaddingTop = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingTop);
const scrollPaddingBottom = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom);
const header = (page: Page) => page.locator("[data-site-header]");
/** The English offer on an Arabic page, a region named by its text (FR-01.2a) */
const offer = (page: Page) => page.getByRole("region", { name: CATALOGS.ar.locale.prompt.text });
/** The links of the lab's wordmarks, near the end of the page */
const wordmarkLinks = (page: Page) =>
  page.locator("section", { has: page.getByRole("heading", { name: "Wordmarks" }) }).getByRole("link");
/** Waits for the page to hydrate: the toaster's region comes once it has (D-047) */
const hydrated = (page: Page, locale: "ar" | "en") =>
  expect(page.getByRole("region", { name: CATALOGS[locale].common.notifications })).toBeAttached();

/** A garage of saved cars, as the store keeps it in local storage (BR-36) */
const savedCars = (count: number) =>
  JSON.stringify(Array.from({ length: count }, (_, index) => ({ carId: `car-${index}` })));

/**
 * The navigation's links as a visitor reaches them, with each one's current-page mark and how it is
 * underlined: the header's from 768 px, else the menu sheet's, which this opens
 */
async function navMarks(page: Page, menuLabel: string) {
  let links = header(page).getByRole("listitem").getByRole("link");
  if (widthOf(page) < MENU_BELOW) {
    await page.getByRole("button", { name: menuLabel }).click();
    links = page.getByRole("dialog", { name: menuLabel }).getByRole("listitem").getByRole("link");
    await expect(links.first()).toBeVisible();
  }
  return links.evaluateAll((elements) =>
    elements.map((link) => ({
      name: link.textContent,
      current: link.getAttribute("aria-current"),
      line: getComputedStyle(link).textDecorationLine,
    })),
  );
}

/** A page hidden from assistive technology, as a modal sheet leaves the rest of it (arrive.ts) */
const HIDDEN_PAGE = '[inert], [aria-hidden="true"]';

/**
 * Clicks an element where it is, as a visitor's mouse does. Playwright's own click first scrolls the
 * element into view, and the page's scroll padding counts the sticky header's controls as covered.
 */
async function clickInPlace(element: Locator) {
  const box = await element.boundingBox();
  if (!box) throw new Error("the element is not on the page");
  await element.page().mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/**
 * Records each text the shell's route announcer takes from now on, and each element that takes the
 * focus, with whether the page was hidden from assistive technology at that moment
 */
async function recordArrivals(page: Page) {
  await page.addInitScript((hiddenPage) => {
    window.announced = [];
    window.focused = [];
    let last = "";
    new MutationObserver(() => {
      const text = document.querySelector("[data-route-announcer]")?.textContent ?? "";
      if (text === last) return;
      last = text;
      window.announced.push(text);
    }).observe(document, { childList: true, subtree: true, characterData: true });
    document.addEventListener(
      "focusin",
      ({ target }) => {
        if (target instanceof Element) {
          window.focused.push({ name: target.localName, hidden: target.closest(hiddenPage) !== null });
        }
      },
      { capture: true },
    );
  }, HIDDEN_PAGE);
}

/** Each focus a level 1 heading took, and whether the page was hidden then */
const headingFocuses = (page: Page) => page.evaluate(() => window.focused.filter(({ name }) => name === "h1"));

/**
 * Loads a page at each width in turn, then checks it there: a visit at the first width and a reload at
 * each after. A second visit to an address in Firefox comes from its cache while the cache revalidates
 * it, as next start's pages allow, and Playwright can wait on that request for good (D-047).
 */
async function atEachWidth(
  page: Page,
  url: string,
  widths: readonly number[],
  check: (width: number) => Promise<void>,
) {
  for (const [index, width] of widths.entries()) {
    await page.setViewportSize({ width, height: 800 });
    if (index === 0) await page.goto(url);
    else await page.reload();
    await check(width);
  }
}

/** The bottom edge of an element, in viewport pixels */
async function bottomOf(element: Locator): Promise<number> {
  const box = await element.boundingBox();
  if (!box) throw new Error("the element is not on the page");
  return box.y + box.height;
}

/** Scrolls the page so that an element's top sits 8 px below a line on the screen, as under a bar or a card */
async function placeUnder(element: Locator, line: number) {
  const top = await element.evaluate((node) => node.getBoundingClientRect().top + window.scrollY);
  await element.page().evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), top - line - 8);
}

/** How much of the screen's height the header and the English offer cover together */
function chromeCover(page: Page): Promise<number> {
  return page.evaluate(() => {
    const inView = (element: Element | null) => {
      if (element === null) return 0;
      const box = element.getBoundingClientRect();
      return Math.max(0, Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0));
    };
    return (
      inView(document.querySelector("[data-site-header]")) + inView(document.querySelector("[data-locale-prompt]"))
    );
  });
}

/** Follows the lab's link to section 9, and expects the section's heading at the very top of the screen */
async function jumpLandsAtTop(page: Page) {
  await page.getByRole("link", { name: "Jump to section 9" }).click();
  const heading = page.getByRole("heading", { name: "Section 9", exact: true });
  await expect(heading).toBeInViewport();
  // Within half a pixel, as scroll offsets are whole pixels (D-047)
  await expect.poll(async () => Math.abs((await heading.boundingBox())?.y ?? Infinity)).toBeLessThanOrEqual(0.5);
}

/** The page's layout shifts so far, summed; Chromium alone reports them */
async function layoutShift(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let total = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) total += (entry as PerformanceEntry & { value: number }).value;
        }).observe({ type: "layout-shift", buffered: true });
        // The buffered entries arrive in a task of their own
        setTimeout(() => resolve(total), 250);
      }),
  );
}

for (const locale of LOCALES) {
  const t = CATALOGS[locale];

  test.describe(`/${locale}`, () => {
    test("TC-02-1: the first Tab reaches the skip link, which moves the focus to main, on Home, the 404 and the lab", async ({
      page,
      browserName,
    }) => {
      const skip = page.getByRole("link", { name: t.common.skip });
      for (const path of ["", "/nothing", LAB]) {
        await page.goto(`/${locale}${path}`);
        await page.keyboard.press(tabKey(browserName));
        await expect(skip, path).toBeFocused();
        await expect(skip, path).toBeInViewport();
        await page.keyboard.press("Enter");
        await expect(page.locator("main"), path).toBeFocused();
      }
    });

    test("FR-02.3: the demo banner is the first region after the skip link", async ({ page, browserName }) => {
      await page.goto(`/${locale}`);
      const banner = page.getByRole("region", { name: t.demo.bannerLabel });
      await expect(banner).toBeVisible();
      const order = await page.evaluate(() =>
        [...document.body.querySelectorAll("a[href='#content'], section[aria-label], header, nav, main, footer")].map(
          (element) => element.getAttribute("href") ?? element.getAttribute("aria-label") ?? element.localName,
        ),
      );
      expect(order.slice(0, 3)).toStrictEqual(["#content", t.demo.bannerLabel, "header"]);
      await page.keyboard.press(tabKey(browserName));
      await page.keyboard.press(tabKey(browserName));
      await expect(banner.getByRole("button", { name: t.common.hide })).toBeFocused();
    });

    test("TC-02-3: Hide keeps the banner hidden for the session, with no flash or shift on reload", async ({
      page,
      browser,
      browserName,
    }) => {
      await page.goto(`/${locale}`);
      const banner = page.getByRole("region", { name: t.demo.bannerLabel });
      await banner.getByRole("button", { name: t.common.hide }).click();
      await expect(banner).toBeHidden();
      // The banner leaves with its button, so the focus goes on to the header's start
      await expect(header(page).locator("[data-wordmark]")).toBeFocused();

      // On the reloaded page the head script has marked <html> before the parser reaches the banner,
      // and no frame draws it: a page's first frame waits for its stylesheets, which hide it then
      await page.addInitScript(() => {
        window.bannerShown = false;
        new MutationObserver((_, observer) => {
          if (document.querySelector("body [data-demo-banner]") === null) return;
          if (document.documentElement.dataset.demoBanner !== "hidden") window.bannerShown = true;
          observer.disconnect();
        }).observe(document, { childList: true, subtree: true });
        const everyFrame = () => {
          const element = document.querySelector("body [data-demo-banner]");
          if (element && getComputedStyle(element).display !== "none") window.bannerShown = true;
          if (document.readyState !== "complete") requestAnimationFrame(everyFrame);
        };
        requestAnimationFrame(everyFrame);
      });
      await page.reload({ waitUntil: "load" });
      await expect(banner).toBeHidden();
      expect(await page.evaluate(() => window.bannerShown)).toBe(false);
      if (browserName === "chromium") expect(await layoutShift(page)).toBe(0);

      // A new session shows it again
      const session = await browser.newContext();
      const other = await session.newPage();
      await other.goto(`/${locale}`);
      await expect(other.getByRole("region", { name: t.demo.bannerLabel })).toBeVisible();
      await session.close();
    });

    test("BR-14: in demo mode no contact leaves the site, and the number shows masked with the Demo tag (Q-12)", async ({
      page,
    }) => {
      await page.goto(`/${locale}`);
      const contact = page.getByRole("contentinfo").getByRole("listitem").filter({ hasText: DEMO_NUMBER });
      await expect(contact).toBeVisible();
      await expect(contact.getByText(t.demo.tag)).toBeVisible();
      await expect(page.locator("a[href^='tel:'], a[href*='wa.me']")).toHaveCount(0);
    });

    test("the dealer's name in the header fits whole from 320 to 1440 px", async ({ page, isMobile }) => {
      test.skip(isMobile, "the desktop projects try every width");
      await atEachWidth(page, `/${locale}`, [320, 360, 390, 768, 1024, 1440], async (width) => {
        const name = header(page).locator("[data-wordmark] span");
        const { shown, whole } = await name.evaluate((node) => ({ shown: node.clientWidth, whole: node.scrollWidth }));
        expect(whole, `${width} px`).toBeLessThanOrEqual(shown);
      });
    });

    test("no page scrolls sideways, from 320 to 1440 px (WCAG 1.4.10)", async ({ page, isMobile }) => {
      test.skip(isMobile, "the desktop projects try every width");
      for (const path of ["", "/nothing", LAB]) {
        await atEachWidth(page, `/${locale}${path}`, [320, 360, 1440], async (width) => {
          const { scrollWidth, clientWidth } = await page.evaluate(() => {
            const { scrollWidth, clientWidth } = document.documentElement;
            return { scrollWidth, clientWidth };
          });
          expect(scrollWidth, `${path} at ${width} px`).toBeLessThanOrEqual(clientWidth);
        });
      }
    });

    test("marks the current page's link with an underline beside its colour, under more contrast too (DESIGN §7.1.1)", async ({
      page,
    }) => {
      // A page the navigation links to: the cars page, a 404 in the shell until T-20
      await page.goto(`/${locale}/cars`);
      for (const contrast of ["no-preference", "more"] as const) {
        await emulateContrast(page, contrast);
        // A page that doesn't know its path when it is built marks its link once it runs (nav-link.tsx)
        await expect(header(page).locator(`li a[href="/${locale}/cars"]`)).toHaveAttribute("aria-current", "page");
        const [cars, ...others] = await navMarks(page, t.nav.menu);
        expect(cars, contrast).toStrictEqual({ name: t.nav.cars, current: "page", line: "underline" });
        expect(others.length).toBeGreaterThan(0);
        for (const other of others)
          expect(other, `${other.name}, ${contrast}`).toMatchObject({ current: null, line: "none" });
      }
    });

    test("the Garage key counts the cars kept, names the count, and hears another page keep one (DESIGN §7.1.1)", async ({
      page,
      context,
    }) => {
      const named = (count: number) =>
        String(new IntlMessageFormat(t.nav.garageLabel, INTL_LOCALE[locale]).format({ count }));
      await page.addInitScript(({ key, cars }) => localStorage.setItem(key, cars), {
        key: GARAGE_STORAGE_KEY,
        cars: savedCars(2),
      });
      await page.goto(`/${locale}`);
      const garage = header(page).locator(`a[href="/${locale}/garage"]`);
      await expect(garage).toHaveAccessibleName(named(2));
      // The badge, which the key's name says for assistive technology
      await expect(garage.locator("span")).toHaveText("2");
      const other = await context.newPage();
      await other.goto(`/${locale}/nothing`);
      await other.evaluate(({ key, cars }) => localStorage.setItem(key, cars), {
        key: GARAGE_STORAGE_KEY,
        cars: savedCars(3),
      });
      await expect(garage).toHaveAccessibleName(named(3));
      await expect(garage.locator("span")).toHaveText("3");
    });

    test("the Garage key shows no count while storage is blocked, as in some private windows (FR-02)", async ({
      page,
    }) => {
      await page.addInitScript(() => {
        Object.defineProperty(window, "localStorage", {
          get() {
            throw new DOMException("The operation is insecure.", "SecurityError");
          },
        });
      });
      await page.goto(`/${locale}`);
      await hydrated(page, locale);
      const garage = header(page).locator(`a[href="/${locale}/garage"]`);
      await expect(garage).toHaveAccessibleName(t.nav.garage);
      await expect(garage.locator("span")).toHaveCount(0);
    });

    test("the language switch opens the same page in the other language, as a new document (FR-01.4)", async ({
      page,
    }) => {
      const other = otherLocale(locale);
      await page.goto(`/${locale}${LAB}`);
      await hydrated(page, locale);
      // From 768 px the header's switch, and below it the menu's
      let languageSwitch = header(page).locator(`a[hreflang="${other}"]`);
      if (widthOf(page) < MENU_BELOW) {
        await page.getByRole("button", { name: t.nav.menu }).click();
        languageSwitch = page.getByRole("dialog", { name: t.nav.menu }).locator(`a[hreflang="${other}"]`);
      }
      await expect(languageSwitch).toBeVisible();
      await expect(languageSwitch).toHaveAttribute("href", `/${other}${LAB}`);
      await expect(languageSwitch).toHaveAttribute("lang", other);
      await expect(languageSwitch).toHaveAttribute("dir", directionOf(other));
      // A mark on this document, which a new one doesn't have
      await page.evaluate(() => document.documentElement.setAttribute("data-left", ""));
      await languageSwitch.click();
      await expect(page).toHaveURL(new RegExp(`/${other}${LAB}$`));
      await expect(page.locator("html")).toHaveAttribute("lang", other);
      await expect(page.locator("html")).toHaveAttribute("dir", directionOf(other));
      await expect(page.locator("html")).not.toHaveAttribute("data-left");
    });

    test("every icon in the shell and on the 404 is 20 or 24 px (DESIGN §3.6)", async ({ page }) => {
      await page.goto(`/${locale}/nothing`);
      // Phosphor's icons, drawn on a 256 unit square, each one the page shows, by the control it is in
      const icons = await page.locator('svg[viewBox="0 0 256 256"]').evaluateAll((elements) =>
        elements.flatMap((icon) => {
          const { width, height } = icon.getBoundingClientRect();
          const control = icon.closest("a, button");
          const name = control?.getAttribute("aria-label") ?? control?.textContent ?? "";
          return width === 0 ? [] : [{ name, width, height }];
        }),
      );
      expect(icons.length).toBeGreaterThan(0);
      for (const { name, width, height } of icons) {
        expect([20, 24], name).toContain(width);
        expect(height, name).toBe(width);
      }
    });

    // A test a page, each opening one document: leaving a page while it still prefetches its links
    // has WebKit report each fetch it stops as a page error
    for (const [name, path] of [
      ["Home", ""],
      ["the 404", "/nothing"],
      ["the shell lab", LAB],
    ] as const) {
      test(`${name} passes axe and reports no problem`, async ({ page }) => {
        const problems = await watchProblems(page);
        await page.goto(`/${locale}${path}`);
        expect(await seriousA11yIssues(page)).toStrictEqual([]);
        await expectProblems(page, problems);
      });
    }

    test("a toast says so while the browser is offline, until it's back (DESIGN §7.2.11)", async ({
      page,
      context,
    }) => {
      const problems = await watchProblems(page);
      await page.goto(`/${locale}`);
      // The toaster loads once the page has hydrated, while it can still load (D-047)
      const toasts = page.getByRole("region", { name: t.common.notifications });
      await expect(toasts).toBeAttached();
      await context.setOffline(true);
      await expect(toasts.getByText(t.common.offline)).toBeVisible();
      await context.setOffline(false);
      await expect(toasts.getByText(t.common.offline)).toHaveCount(0);
      // Offline, a browser may report each prefetch of the page's links that fails
      const failedPrefetch = /^Failed to load resource: .+ \(\S+\?_rsc=\S+\)$/;
      await expectProblems(
        page,
        problems.filter((problem) => !failedPrefetch.test(problem)),
      );
    });

    test("the toaster loads once the connection is back, when it couldn't load as the page hydrated (D-047)", async ({
      page,
    }) => {
      // While the connection is lost, the scripts the page's HTML names load and any other fails, as
      // Sonner's does when the toaster asks for it once the page has hydrated
      const connection = { lost: true, failed: 0, lastFailed: 0 };
      let html = "";
      await page.route(
        (url) => url.pathname === `/${locale}`,
        async (route) => {
          if (!route.request().isNavigationRequest()) return route.continue();
          const response = await route.fetch();
          html = await response.text();
          return route.fulfill({ response, body: html });
        },
      );
      await page.route("**/_next/static/chunks/**", (route) => {
        const file = new URL(route.request().url()).pathname.split("/").at(-1) ?? "";
        if (!connection.lost || html.includes(file)) return route.continue();
        connection.failed += 1;
        connection.lastFailed = Date.now();
        return route.abort("internetdisconnected");
      });
      await page.goto(`/${locale}`);
      const toasts = page.getByRole("region", { name: t.common.notifications });
      // Every load has failed by now, the bundler's own retry among them
      await expect
        .poll(() => connection.failed > 0 && Date.now() - connection.lastFailed > 1000, { timeout: 10_000 })
        .toBe(true);
      await expect(toasts).not.toBeAttached();
      connection.lost = false;
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await expect(toasts).toBeAttached();
    });

    test("a page that fails shows the segment error in the shell, headed by its line, until Try again (SRS §13.3)", async ({
      page,
    }) => {
      const problems = await watchProblems(page);
      await page.addInitScript((key) => sessionStorage.setItem(key, "1"), FAIL_KEY);
      await page.goto(`/${locale}${LAB}/plain`);
      await page.getByRole("link", { name: "A page that fails" }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}${LAB}/failing$`));
      const alert = page.getByRole("main").getByRole("alert");
      // The arrival's focus lands on the line, as on any page's heading (FR-02.4)
      await expect(alert.getByRole("heading", { level: 1, name: t.errors.segment })).toBeFocused();
      // The rest of the site stays usable around it
      await expect(header(page)).toBeVisible();
      await expect(page.getByRole("contentinfo")).toBeVisible();
      await page.evaluate((key) => sessionStorage.removeItem(key), FAIL_KEY);
      await alert.getByRole("button", { name: t.common.retry }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Failing page" })).toBeVisible();
      await expect(alert).toHaveCount(0);
      // The error the page threw, which React reports, and Firefox prints without its message
      await expectProblems(page, problems, [/^Error\b/]);
    });
  });

  test.describe(`the phone menu on /${locale} (FR-02.7, TC-02-4)`, () => {
    test.beforeEach(({ page }) => {
      test.skip(widthOf(page) >= MENU_BELOW, "the header shows its links from 768 px");
    });

    test("traps the focus both ways, closes on Escape and gives the focus back, and passes axe", async ({
      page,
      browserName,
    }) => {
      const problems = await watchProblems(page);
      await page.goto(`/${locale}`);
      // While the sheet is open the page behind it, its button too, is hidden from assistive technology
      const trigger = page.getByRole("button", { name: t.nav.menu, includeHidden: true });
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: t.nav.menu });
      await expect(dialog).toBeVisible();
      await expect(page.getByRole("button", { name: t.nav.menu })).toHaveCount(0);
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(await seriousA11yIssues(page)).toStrictEqual([]);
      // Past its last control forwards, and past its first backwards
      for (const key of [tabKey(browserName), `Shift+${tabKey(browserName)}`]) {
        for (let step = 0; step < 8; step += 1) {
          await page.keyboard.press(key);
          // Base UI's focus guards hand the focus back inside on the next frame
          await expect
            .poll(() => dialog.evaluate((node) => node.contains(document.activeElement)), {
              message: `${key} ${step + 1}`,
            })
            .toBe(true);
        }
      }
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await expectProblems(page, problems);
    });

    test("gives the focus back without scrolling the page", async ({ page }) => {
      // Under reduced motion a scroll to the focus is instant, so one would show at once
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`/${locale}${LAB}`);
      await page.evaluate(() => window.scrollTo({ top: 1200, behavior: "instant" }));
      await expect.poll(() => scrollTop(page)).toBe(1200);
      const trigger = page.getByRole("button", { name: t.nav.menu, includeHidden: true });
      await clickInPlace(trigger);
      await expect(page.getByRole("dialog", { name: t.nav.menu })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      expect(await scrollTop(page)).toBe(1200);
    });

    test("stays closed while its sheet can't load, as offline, and opens on the next press (D-047)", async ({
      page,
    }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.goto(`/${locale}`);
      await hydrated(page, locale);
      const connection = { lost: true, failed: 0, lastAsked: 0 };
      await page.route("**/_next/static/chunks/**", (route) => {
        if (!connection.lost) return route.continue();
        connection.failed += 1;
        connection.lastAsked = Date.now();
        return route.abort();
      });
      const trigger = page.getByRole("button", { name: t.nav.menu });
      await trigger.click();
      // The sheet's load has given up once its chunks have failed, tried again, and nothing more is asked
      await expect
        .poll(() => connection.failed > 0 && Date.now() - connection.lastAsked > 1000, { timeout: 10_000 })
        .toBe(true);
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      connection.lost = false;
      await trigger.click();
      await expect(page.getByRole("dialog", { name: t.nav.menu })).toBeVisible();
      // A failed load is no error of the page's
      expect(pageErrors).toStrictEqual([]);
    });

    test("closes on a tap outside it", async ({ page }) => {
      await page.goto(`/${locale}`);
      await page.getByRole("button", { name: t.nav.menu }).click();
      const dialog = page.getByRole("dialog", { name: t.nav.menu });
      await expect(dialog).toBeVisible();
      await page.mouse.click(widthOf(page) / 2, 120);
      await expect(dialog).toBeHidden();
    });

    test("closes on a navigation, and the new page's heading takes the focus", async ({ page }) => {
      await recordArrivals(page);
      await page.goto(`/${locale}`);
      await page.getByRole("button", { name: t.nav.menu }).click();
      const dialog = page.getByRole("dialog", { name: t.nav.menu });
      await dialog.getByRole("link", { name: t.nav.compare }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/compare$`));
      await expect(dialog).toBeHidden();
      await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
      // The focus and the title wait for the sheet to let go of the page, which it hid behind it
      expect(await headingFocuses(page)).toStrictEqual([{ name: "h1", hidden: false }]);
      await expect(page).toHaveTitle(new RegExp(`^${t.errors.notFound.title} · `));
      const title = await page.title();
      await expect.poll(() => page.evaluate(() => window.announced)).toStrictEqual([title]);
    });

    test("closes on a step back, and the link the page was left by takes the focus once the page is back", async ({
      page,
    }) => {
      await recordArrivals(page);
      await page.goto(`/${locale}${LAB}`);
      await page.getByRole("link", { name: "A plain page" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Plain page" })).toBeFocused();
      await page.getByRole("button", { name: t.nav.menu }).click();
      const dialog = page.getByRole("dialog", { name: t.nav.menu });
      await expect(dialog).toBeVisible();
      // The route announcer stays out of what the sheet hides, so an announcement made under it is heard
      const announcer = page.locator("[data-route-announcer]");
      expect(await announcer.evaluate((node, hiddenPage) => node.closest(hiddenPage), HIDDEN_PAGE)).toBeNull();
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`/${locale}${LAB}$`));
      await expect(dialog).toBeHidden();
      // A step back gives the focus back to the link the lab was left by (FR-02.4), once the sheet
      // has let go of the page: the last focus was the link's, while the page showed, and only the
      // plain page's heading took the focus
      await expect(page.getByRole("link", { name: "A plain page" })).toBeFocused();
      expect(await page.evaluate(() => window.focused.slice(-1))).toStrictEqual([{ name: "a", hidden: false }]);
      expect(await headingFocuses(page)).toStrictEqual([{ name: "h1", hidden: false }]);
      await expect(page).toHaveTitle(/^Muftah dev: shell · /);
      const [plain, lab] = [await page.evaluate(() => window.announced[0]), await page.title()];
      await expect.poll(() => page.evaluate(() => window.announced)).toStrictEqual([plain, lab]);
      expect(plain).toMatch(/^Muftah dev: plain · /);
    });
  });
}

test.describe("without JavaScript, on a phone", () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 360, height: 780 } });

  test("the footer's bottom row opens the page in the other language (FR-01.4, DESIGN §7.1.1)", async ({ page }) => {
    // Each way from a page not visited yet: visited again, the page Firefox has open comes from
    // its cache while Firefox checks it in the background, and Playwright waits on a load that
    // never ends (D-047)
    for (const [from, to, path] of [
      ["ar", "en", LAB],
      ["en", "ar", `${LAB}/plain`],
    ] as const) {
      await page.goto(`/${from}${path}`);
      const languageSwitch = page.getByRole("contentinfo").locator(`a[hreflang="${to}"]`);
      await expect(languageSwitch).toBeVisible();
      await expect(languageSwitch).toHaveAttribute("href", `/${to}${path}`);
      await languageSwitch.click();
      await expect(page).toHaveURL(new RegExp(`/${to}${path}$`));
      await expect(page.locator("html")).toHaveAttribute("lang", to);
    }
  });
});

test.describe("a navigation", () => {
  test("FR-02.4: moves the focus to the new page's heading and announces its title", async ({ page }) => {
    const problems = await watchProblems(page);
    await recordArrivals(page);
    await page.goto(`/en${LAB}`);
    // The first page's title is the browser's to read out
    await expect(page.locator("[data-route-announcer]")).toHaveText("");
    await page.getByRole("link", { name: "A plain page" }).click();
    await expect(page).toHaveURL(new RegExp(`/en${LAB}/plain$`));
    await expect(page.getByRole("heading", { level: 1, name: "Plain page" })).toBeFocused();
    await expect(page).toHaveTitle(/^Muftah dev: plain · /);
    expect(await headingFocuses(page)).toStrictEqual([{ name: "h1", hidden: false }]);
    // The whole title, never the heading in its place, even when the title comes after the page (D-047)
    const title = await page.title();
    await expect.poll(() => page.evaluate(() => window.announced)).toStrictEqual([title]);
    // Next.js's own announcer, which reads the heading when the title comes late, is hidden
    const nextAnnouncer = page.locator("#__next-route-announcer__");
    await expect(nextAnnouncer).toHaveCount(1);
    await expect(nextAnnouncer).toBeHidden();
    await expectProblems(page, problems);
  });

  test("FR-02.4: arrives on a browser without checkVisibility, as Safari before 17.4 (SRS C-09)", async ({ page }) => {
    await page.addInitScript(() => Reflect.deleteProperty(Element.prototype, "checkVisibility"));
    await page.goto(`/en${LAB}`);
    await page.getByRole("link", { name: "A plain page" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Plain page" })).toBeFocused();
  });

  test("FR-02.4: a failing arrival is reported and leaves the page in place", async ({ page }) => {
    const problems = await watchProblems(page);
    await page.addInitScript(() => {
      const boxes = Element.prototype.getClientRects;
      Element.prototype.getClientRects = function (this: Element) {
        if (this.localName === "h1") throw new Error("a failing arrival");
        return boxes.call(this);
      };
    });
    await page.goto(`/en${LAB}`);
    await page.getByRole("link", { name: "A plain page" }).click();
    await expect(page).toHaveURL(new RegExp(`/en${LAB}/plain$`));
    await expect(page.getByRole("heading", { level: 1, name: "Plain page" })).toBeVisible();
    await expect.poll(() => problems.some((problem) => problem.includes("a failing arrival"))).toBe(true);
  });

  // A step back or forward gives the focus back to the control its page was left by, while it is
  // still there, so a keyboard or screen reader user goes on from their place (the owner's answer
  // of 2026-10-31)
  for (const way of ["a click", "the keyboard"] as const) {
    test(`FR-02.4: a step back gives the focus back to the link the page was left by with ${way}, at its place`, async ({
      page,
      browserName,
    }) => {
      await recordArrivals(page);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`/en${LAB}`);
      await hydrated(page, "en");
      // The lab's third wordmark, which links to Home as the header's and the other wordmarks do
      const link = wordmarkLinks(page).nth(2);
      await link.evaluate((node) => {
        window.scrollTo({ top: node.getBoundingClientRect().top + window.scrollY - 300, behavior: "instant" });
      });
      const place = await scrollTop(page);
      // A click leaves the link without the focus in WebKit; Enter presses the link the focus is on
      if (way === "a click") await clickInPlace(link);
      else {
        await link.focus();
        await page.keyboard.press("Enter");
      }
      await expect(page).toHaveURL(/\/en$/);
      await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`/en${LAB}$`));
      await expect(link).toBeFocused();
      await expect.poll(() => scrollTop(page)).toBe(place);
      // Home's heading took the focus, and the lab's didn't on the way back
      expect(await headingFocuses(page)).toStrictEqual([{ name: "h1", hidden: false }]);
      // The next control is the next wordmark, so the page stays at its place, where the heading's
      // focus would have sent the first Tab back to the page's top
      await page.keyboard.press(tabKey(browserName));
      await expect(wordmarkLinks(page).nth(3)).toBeFocused();
      expect(await scrollTop(page)).toBeGreaterThanOrEqual(place);
    });
  }

  test("FR-02.4: a page a step left gets back the control that had the focus, and one that had none its heading", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/en${LAB}`);
    await hydrated(page, "en");
    await page.getByRole("link", { name: "A plain page" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Plain page" })).toBeFocused();
    await page.goBack();
    await expect(page.getByRole("link", { name: "A plain page" })).toBeFocused();
    // The keyboard moves on to a wordmark, and the browser's step forward leaves the lab with the
    // focus there
    const link = wordmarkLinks(page).nth(4);
    await link.focus();
    await page.goForward();
    // The plain page was left by the step back, with the focus on its heading, which is no control
    await expect(page.getByRole("heading", { level: 1, name: "Plain page" })).toBeFocused();
    await page.goBack();
    await expect(link).toBeFocused();
  });

  test("FR-02.4: a step back to a page left by a control that has gone gives the focus to its heading", async ({
    page,
  }) => {
    test.skip(widthOf(page) >= MENU_BELOW, "the menu's links are a phone's");
    await page.goto(`/en${LAB}`);
    await hydrated(page, "en");
    await page.getByRole("button", { name: CATALOGS.en.nav.menu }).click();
    const dialog = page.getByRole("dialog", { name: CATALOGS.en.nav.menu });
    await dialog.getByRole("link", { name: CATALOGS.en.nav.compare }).click();
    await expect(page).toHaveURL(/\/en\/compare$/);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/en${LAB}$`));
    // The menu's link went with the menu, which closed as the page it opened came, though the
    // footer links the same page
    await expect(page.getByRole("heading", { level: 1, name: "Shell lab" })).toBeFocused();
  });

  test("FR-02.5: starts a new page at its top, and a step back or forward returns to where it was", async ({
    page,
  }) => {
    await page.goto(`/en${LAB}`);
    await page.evaluate(() => window.scrollTo({ top: 1200, behavior: "instant" }));
    await expect.poll(() => scrollTop(page)).toBe(1200);
    // Home is shorter than the place it opens from, which cuts the browser's own saved place short
    await clickInPlace(header(page).locator("[data-wordmark]"));
    await expect(page).toHaveURL(/\/en$/);
    await expect.poll(() => scrollTop(page)).toBe(0);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/en${LAB}$`));
    await expect.poll(() => scrollTop(page)).toBe(1200);
    await page.goForward();
    await expect(page).toHaveURL(/\/en$/);
    await expect.poll(() => scrollTop(page)).toBe(0);
    await page.goBack();
    await expect.poll(() => scrollTop(page)).toBe(1200);
  });

  test("FR-02.5: a step taken just after a scroll, with no click before it, returns to where it was", async ({
    page,
  }) => {
    await page.goto(`/en${LAB}`);
    await page.getByRole("link", { name: "A plain page" }).click();
    await expect(page).toHaveURL(new RegExp(`/en${LAB}/plain$`));
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/en${LAB}$`));
    // The press ends the restore that holds the page at its saved place (D-047)
    await page.getByRole("heading", { level: 1, name: "Shell lab" }).click();
    // A scroll, then at once a step by a key or the browser's own button, which no click goes before
    await page.evaluate(() => {
      window.scrollTo({ top: 1500, behavior: "instant" });
      window.history.forward();
    });
    await expect(page).toHaveURL(new RegExp(`/en${LAB}/plain$`));
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/en${LAB}$`));
    await expect.poll(() => scrollTop(page)).toBe(1500);
  });

  test("FR-02.5: a router write over a page's entry, as a filter makes, keeps its place for a step back", async ({
    page,
  }) => {
    await page.goto(`/en${LAB}/plain`);
    await page.getByRole("link", { name: "The shell lab" }).click();
    await expect(page).toHaveURL(new RegExp(`/en${LAB}$`));
    // The visitor takes over the new page: the press ends the hold that keeps it at its top for its
    // first frames, which would undo a scroll made sooner (D-047)
    await page.getByRole("heading", { level: 1, name: "Shell lab" }).click();
    await page.evaluate(() => window.scrollTo({ top: 900, behavior: "instant" }));
    await expect.poll(() => scrollTop(page)).toBe(900);
    // Pressed where it is, out of view: Playwright's own click would scroll to it first
    await page.getByRole("button", { name: "Replace the query" }).dispatchEvent("click");
    await expect(page).toHaveURL(new RegExp(`/en${LAB}\\?view=replaced$`));
    expect(await scrollTop(page)).toBe(900);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/en${LAB}/plain$`));
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`/en${LAB}\\?view=replaced$`));
    await expect.poll(() => scrollTop(page)).toBe(900);
  });

  test("FR-02.5: a step back from an in-page jump returns to where it started", async ({ page }) => {
    await page.goto(`/en${LAB}`);
    await page.evaluate(() => window.scrollTo({ top: 100, behavior: "instant" }));
    await expect.poll(() => scrollTop(page)).toBe(100);
    await page.getByRole("link", { name: "Jump to section 9" }).click();
    await expect(page).toHaveURL(new RegExp(`/en${LAB}#section-9$`));
    const section = page.getByRole("heading", { name: "Section 9", exact: true });
    await expect(section).toBeInViewport();
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/en${LAB}$`));
    await expect.poll(() => scrollTop(page)).toBe(100);
    await page.goForward();
    await expect(section).toBeInViewport();
  });

  test("FR-02.5: the skip link's step stays a step back to its page, after another page", async ({
    page,
    browserName,
  }) => {
    await page.goto(`/en${LAB}`);
    await page.keyboard.press(tabKey(browserName));
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/en${LAB}#content$`));
    await page.getByRole("link", { name: "A plain page" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Plain page" })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/en${LAB}#content$`));
    await expect(page.getByRole("heading", { level: 1, name: "Shell lab" })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/en${LAB}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Shell lab" })).toBeVisible();
  });

  test("FR-02.5: a reload keeps the page's place", async ({ page }) => {
    await page.goto(`/en${LAB}`);
    await page.evaluate(() => window.scrollTo({ top: 900, behavior: "instant" }));
    await expect.poll(() => scrollTop(page)).toBe(900);
    await page.reload();
    await expect.poll(() => scrollTop(page)).toBe(900);
  });

  test("FR-02.5: a reload keeps the page's place, after steps back and forward", async ({ page }) => {
    await page.goto(`/en${LAB}`);
    await page.getByRole("link", { name: "A plain page" }).click();
    await expect(page).toHaveURL(new RegExp(`/en${LAB}/plain$`));
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/en${LAB}$`));
    // Once the page is back, the visitor takes over: the press ends the restore that holds the page at
    // its saved place for a few frames, which would undo a scroll made sooner (D-047)
    await page.getByRole("heading", { level: 1, name: "Shell lab" }).click();
    await page.evaluate(() => window.scrollTo({ top: 900, behavior: "instant" }));
    await expect.poll(() => scrollTop(page)).toBe(900);
    await page.reload();
    await expect.poll(() => scrollTop(page)).toBe(900);
  });

  test("FR-02.6: an in-page jump stops clear of the sticky header", async ({ page }) => {
    await page.goto(`/en${LAB}`);
    await page.getByRole("link", { name: "Jump to section 9" }).click();
    const heading = page.getByRole("heading", { name: "Section 9", exact: true });
    await expect(heading).toBeInViewport();
    const headerBottom = await bottomOf(header(page));
    // Chromium and WebKit keep a scroll offset in whole pixels, rounded to the nearest, so a heading at
    // a fractional place lands up to half a pixel short of its mark (D-047)
    await expect.poll(async () => (await heading.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(headerBottom - 0.5);
  });

  test("FR-02.6 and FR-02.6a: in-page jumps glide unless motion is reduced, and never for the dealer", async ({
    page,
  }) => {
    const scrollBehavior = () => page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
    await page.goto("/en");
    expect(await scrollBehavior()).toBe("smooth");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await scrollBehavior()).toBe("auto");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/en/dealer/dev/tokens");
    expect(await scrollBehavior()).toBe("auto");
  });
});

test.describe("the header", () => {
  test("compacts after a scroll without moving the page (DESIGN §7.1.1)", async ({ page, browserName }) => {
    await page.goto(`/en${LAB}`);
    const band = header(page);
    await expect(band).not.toHaveAttribute("data-compact");
    const height = await band.evaluate((node: HTMLElement) => node.offsetHeight);
    await band.evaluate((node: HTMLElement) => {
      window.moved = [];
      node.addEventListener("transitionrun", ({ target, propertyName }) => {
        if (propertyName === "translate") window.moved.push(target === node ? "band" : "row");
      });
    });
    await page.evaluate(() => window.scrollTo({ top: 400, behavior: "instant" }));
    await expect(band).toHaveAttribute("data-compact", "true");
    // From 768 px the band glides up as its row glides down, the two together
    if (widthOf(page) >= MENU_BELOW)
      await expect.poll(() => page.evaluate(() => window.moved.toSorted())).toStrictEqual(["band", "row"]);
    // Its box keeps its height: from 768 px it moves up by a transform alone
    expect(await band.evaluate((node: HTMLElement) => node.offsetHeight)).toBe(height);
    expect(await band.evaluate((node) => getComputedStyle(node).position)).toBe("sticky");
    if (browserName === "chromium") expect(await layoutShift(page)).toBe(0);
    // It turns --surface-1, and from 768 px reads as 52 px tall, where a phone's stays 56 px
    const surface = await computed(page, "color", "var(--surface-1)");
    await expect.poll(() => band.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(surface);
    await expect.poll(() => bottomOf(band)).toBe(widthOf(page) >= MENU_BELOW ? 52 : 56);
  });

  test("compacts by its colour alone under reduced motion (DESIGN §7.1.1)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/en${LAB}`);
    const band = header(page);
    await page.evaluate(() => window.scrollTo({ top: 400, behavior: "instant" }));
    await expect(band).toHaveAttribute("data-compact", "true");
    const surface = await computed(page, "color", "var(--surface-1)");
    await expect.poll(() => band.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(surface);
    expect(await band.evaluate((node) => getComputedStyle(node).translate)).toBe("none");
    expect(await bottomOf(band)).toBe(widthOf(page) >= MENU_BELOW ? 64 : 56);
  });

  test("leaves the page where it is as the focus moves into it (DESIGN §8.4)", async ({ page }) => {
    // Under reduced motion a scroll to the focus is instant, so one would show at once
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/en${LAB}`);
    await page.evaluate(() => window.scrollTo({ top: 1200, behavior: "instant" }));
    await expect.poll(() => scrollTop(page)).toBe(1200);
    const controls = await header(page).locator("a:visible, button:visible").all();
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      await control.focus();
      await expect(control).toBeFocused();
      expect(await scrollTop(page)).toBe(1200);
    }
  });

  test("scrolls away with the page on a screen under 480 px tall, where a jump stops at the top (DESIGN §8.4)", async ({
    page,
  }) => {
    // Under reduced motion a jump is instant
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto(`/en${LAB}`);
    expect(await header(page).evaluate((node) => getComputedStyle(node).position)).toBe("static");
    await jumpLandsAtTop(page);
  });
});

test.describe("a car page's action bar, on the shell lab (FR-02.2, TC-02-2)", () => {
  const bar = (page: Page) => page.locator("[data-action-bar]");

  test("holds the bottom below 1024 px, and the page's last line stays clear of it", async ({ page }) => {
    test.skip(widthOf(page) >= BAR_BELOW, "a screen 1024 px and wider has no action bar");
    await page.goto(`/en${LAB}`);
    await expect(bar(page)).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    await expect(bar(page)).toBeInViewport();
    const barTop = (await bar(page).boundingBox())?.y ?? 0;
    expect(barTop).toBeGreaterThan(0);
    expect(await bottomOf(page.locator("footer").getByRole("link").last())).toBeLessThanOrEqual(barTop);
  });

  test("is 64 px tall, and 48 px on a phone held sideways, with the page's last line clear of it (FR-02, DESIGN §8.4)", async ({
    page,
  }) => {
    for (const [width, height, barHeight] of [
      [360, 780, 64],
      [844, 390, 48],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto(`/en${LAB}`);
      await expect(bar(page)).toBeVisible();
      expect((await bar(page).boundingBox())?.height, `${width} by ${height} px`).toBe(barHeight);
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
      const barTop = (await bar(page).boundingBox())?.y ?? 0;
      expect(
        await bottomOf(page.locator("footer").getByRole("link").last()),
        `${width} by ${height} px`,
      ).toBeLessThanOrEqual(barTop);
    }
  });

  test("isn't there from 1024 px", async ({ page }) => {
    test.skip(widthOf(page) < BAR_BELOW, "below 1024 px the bar shows");
    await page.goto(`/en${LAB}`);
    await expect(bar(page)).toBeHidden();
    const block = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bar-block"));
    expect(block.trim()).toBe("0px");
  });

  test("steps aside while the keyboard is open (DESIGN §8.4)", async ({ page }) => {
    test.skip(widthOf(page) >= BAR_BELOW, "a screen 1024 px and wider has no action bar");
    // A phone with its keyboard open: a visual viewport under 500 px tall
    await page.setViewportSize({ width: widthOf(page), height: 450 });
    await page.goto(`/en${LAB}`);
    await expect(bar(page)).toBeVisible();
    await page.getByLabel("A text field").focus();
    await expect(bar(page)).toBeHidden();
    // The focus moving on to another text field keeps the keyboard open, and a checkbox opens none
    await page.getByLabel("A second text field").focus();
    await expect(bar(page)).toBeHidden();
    await page.getByLabel("A checkbox").focus();
    await expect(bar(page)).toBeVisible();
    await page.getByLabel("A text field").focus();
    await expect(bar(page)).toBeHidden();
    await page.getByLabel("A text field").blur();
    await expect(bar(page)).toBeVisible();
  });

  test("keeps a control the focus moves to clear of it (DESIGN §8.4, WCAG 2.4.11)", async ({ page, browserName }) => {
    test.skip(widthOf(page) >= BAR_BELOW, "a screen 1024 px and wider has no action bar");
    // Under reduced motion a scroll to the focus is instant
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/en${LAB}`);
    await wordmarkLinks(page).first().focus();
    const barTop = (await bar(page).boundingBox())?.y ?? 0;
    const link = wordmarkLinks(page).nth(1);
    await placeUnder(link, barTop);
    expect(await bottomOf(link)).toBeGreaterThan(barTop);
    await page.keyboard.press(tabKey(browserName));
    await expect(link).toBeFocused();
    await expect.poll(() => bottomOf(link)).toBeLessThanOrEqual(barTop);
  });

  test("keeps the toasts above it", async ({ page }) => {
    test.skip(widthOf(page) >= BAR_BELOW, "a screen 1024 px and wider has no action bar");
    await page.goto(`/en${LAB}`);
    await page.getByRole("button", { name: "Show a toast" }).click();
    const toast = page.locator("[data-sonner-toast]");
    await expect(toast).toBeVisible();
    const barTop = (await bar(page).boundingBox())?.y ?? 0;
    await expect.poll(() => bottomOf(toast)).toBeLessThanOrEqual(barTop);
  });

  test.describe("for a browser whose first language is English", () => {
    test.use({ locale: "en-US" });

    test("the English offer waits while the bar shows, and shows without one (D-047)", async ({ page }) => {
      const prompt = offer(page);
      await page.goto(`/ar${LAB}`);
      // Decided after hydration, the offer is on the page either way
      await expect(page.locator("[data-locale-prompt]")).toHaveCount(1);
      if (widthOf(page) < BAR_BELOW) await expect(prompt).toBeHidden();
      else await expect(prompt).toBeVisible();
      await page.goto(`/ar${LAB}/plain`);
      await expect(prompt).toBeVisible();
    });
  });
});

test.describe("the English offer with the shell's header, for a browser whose first language is English (FR-01.2a)", () => {
  test.use({ locale: "en-US" });

  // A phone whose browser's bars leave it 560 px, and a laptop's window 600 px tall: the header and the
  // offer together would pass a quarter of either
  for (const size of [
    { width: 360, height: 560 },
    { width: 1280, height: 600 },
  ]) {
    test(`at ${size.width} by ${size.height} px, the header scrolls away while the offer shows, and holds once it is dismissed (DESIGN §8.4)`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize(size);
      await page.goto(`/ar${LAB}/plain`);
      await expect(offer(page)).toBeVisible();
      await page.evaluate(() => window.scrollTo({ top: 200, behavior: "instant" }));
      await expect.poll(() => scrollTop(page)).toBe(200);
      expect(await chromeCover(page)).toBeLessThanOrEqual(size.height * STICKY_BUDGET);
      expect(await scrollPaddingTop(page)).toBe("0px");
      await offer(page).getByRole("button", { name: CATALOGS.ar.locale.prompt.stay }).click();
      await expect(offer(page)).toBeHidden();
      expect(await header(page).evaluate((node) => getComputedStyle(node).position)).toBe("sticky");
      await expect.poll(async () => (await header(page).boundingBox())?.y).toBe(0);
      expect(await scrollPaddingTop(page)).not.toBe("0px");
    });
  }

  test("a jump stops at the top while the header has gone with the page for the offer (DESIGN §8.4)", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto(`/ar${LAB}`);
    await expect(offer(page)).toBeVisible();
    await jumpLandsAtTop(page);
  });

  test("keeps a control the focus moves to clear of the offer (DESIGN §8.4, WCAG 2.4.11)", async ({
    page,
    browserName,
  }) => {
    test.skip(widthOf(page) < BAR_BELOW, "below 1024 px the offer waits for the lab's action bar");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/ar${LAB}`);
    await expect(offer(page)).toBeVisible();
    await wordmarkLinks(page).first().focus();
    const offerTop = (await page.locator("[data-locale-prompt]").boundingBox())?.y ?? 0;
    const link = wordmarkLinks(page).nth(1);
    await placeUnder(link, offerTop);
    expect(await bottomOf(link)).toBeGreaterThan(offerTop);
    await page.keyboard.press(tabKey(browserName));
    await expect(link).toBeFocused();
    await expect.poll(() => bottomOf(link)).toBeLessThanOrEqual(offerTop);
  });

  // A phone, and a tablet held sideways, whose keyboard, as Android's, leaves the page 490 px: under
  // 500 px, and over the 480 px under which the header never holds
  for (const size of [
    { width: 360, height: 780 },
    { width: 1280, height: 800 },
  ]) {
    test(`at ${size.width} px wide, steps aside while a text field has the keyboard open, and comes back once it closes (DESIGN §8.4)`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width: size.width, height: size.height });
      // The 404, which has a search field and no action bar
      await page.goto("/ar/nothing");
      await expect(offer(page)).toBeVisible();
      const field = page.locator('input[name="q"]');
      await field.focus();
      // On a screen this tall, a focused field leaves no doubt that the keyboard is closed
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      await expect(offer(page)).toBeVisible();
      await page.setViewportSize({ width: size.width, height: 490 });
      await expect(offer(page)).toBeHidden();
      // Stepped aside, the offer holds nothing: the header holds again, and the page's end keeps no
      // room for it
      expect(await header(page).evaluate((node) => getComputedStyle(node).position)).toBe("sticky");
      expect(await scrollPaddingBottom(page)).toBe("0px");
      await field.blur();
      await expect(offer(page)).toBeVisible();
      // Back with the offer, the header goes with the page, as the two would pass a quarter of what
      // is left
      expect(await header(page).evaluate((node) => getComputedStyle(node).position)).toBe("static");
      expect(await scrollPaddingBottom(page)).not.toBe("0px");
    });
  }
});
