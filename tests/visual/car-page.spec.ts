import { expect, type Page, test } from "@playwright/test";
import { CarFixtures, seedCar } from "../support/car-fixture.ts";
import { CATALOGS } from "../support/catalogs.ts";
import { hydrated } from "../support/e2e-page.ts";
import { EIGHTEEN } from "../support/fixture-photos.ts";
import { settled, viewer } from "../support/photo-viewer.ts";

// The car page's approved looks (SRS §16.2 step 6, NFR-I18N-02, DESIGN §7.2.3, §7.2.4 and §7.2.11),
// in both languages on every project, each as its first screen shows it: seed car s01's page, whose
// photo column holds the quiet frame of a car without photos; a reserved car's band, and a sold
// car's with its one action; a copy of s01 with TC-10-1's 18 photos, and its fullscreen viewer open
// at the first of them; and, whole, the 404 of a car the site took down. What changes with the day
// or the copy is masked, so neither changes a baseline: the month a car's licence runs to, which
// the seed counts from the day it loads, the mileage check, which reads the car's age, a copy's
// reference, and the footer's year. The fixture photos' files are hidden while a screenshot is
// taken (fixture-photos.css). Motion is reduced.

const LOCALES = ["ar", "en"] as const;

const fixtures = new CarFixtures();
test.afterEach(() => fixtures.remove());

const PHOTOS_HIDDEN = "tests/visual/fixture-photos.css";

/** What on a car's page changes with the day: the month its licence runs to, the mileage check */
function daily(page: Page, locale: "ar" | "en") {
  const label = page.getByText(CATALOGS[locale].field.licenceUntil, { exact: true });
  return [page.locator("dl > div").filter({ has: label }).locator("dd"), page.locator("main summary")];
}

/** A copy's reference, which is its own, where a seed car's is the seed's */
const reference = (page: Page, locale: "ar" | "en") =>
  page.locator("h1 ~ p", { hasText: CATALOGS[locale].car.ref.replace("{ref}", "").trim() }).locator("bdi");

const year = (page: Page) => page.locator("footer").getByText(/^©/);

/** Opens the car's page, hydrated: the toaster's region comes once it has */
async function openCar(page: Page, locale: "ar" | "en", slug: string) {
  await page.goto(`/${locale}/cars/${slug}`);
  await hydrated(page, locale);
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

for (const locale of LOCALES) {
  test(`a car without photos, seed car s01, in ${locale}`, async ({ page }) => {
    await openCar(page, locale, (await seedCar("s01")).slug);
    await expect(page).toHaveScreenshot(`car-${locale}.png`, { mask: daily(page, locale) });
  });

  test(`a reserved car's band, seed car s16, in ${locale}`, async ({ page }) => {
    await openCar(page, locale, (await seedCar("s16")).slug);
    await expect(page).toHaveScreenshot(`car-reserved-${locale}.png`, { mask: daily(page, locale) });
  });

  test(`a sold car's band and its one action, in ${locale}`, async ({ page }) => {
    await openCar(page, locale, await fixtures.copy("s20", "sold"));
    await expect(page).toHaveScreenshot(`car-sold-${locale}.png`, {
      mask: [...daily(page, locale), reference(page, locale)],
    });
  });

  test(`the gallery of a car with 18 photos, in ${locale}`, async ({ page }) => {
    await openCar(page, locale, await fixtures.copy("s01", "published", { photos: EIGHTEEN }));
    await expect(page).toHaveScreenshot(`car-gallery-${locale}.png`, {
      mask: [...daily(page, locale), reference(page, locale)],
      stylePath: PHOTOS_HIDDEN,
    });
  });

  test(`the fullscreen viewer, open at the first photo, in ${locale}`, async ({ page }) => {
    await openCar(page, locale, await fixtures.copy("s01", "published", { photos: EIGHTEEN }));
    await page.locator("[data-photo]:first-child > button").click();
    await settled(page);
    // The title takes the focus a frame after a press opens the viewer
    await expect(viewer(page).getByRole("heading")).toBeFocused();
    // The viewer covers the page, so nothing under it is masked: a mask is drawn over everything
    await expect(page).toHaveScreenshot(`car-viewer-${locale}.png`, { stylePath: PHOTOS_HIDDEN });
  });

  test(`the 404 of a car the site took down, in ${locale}`, async ({ page }) => {
    await openCar(page, locale, await fixtures.copy("s01", "archived"));
    await expect(page).toHaveScreenshot(`car-gone-${locale}.png`, { fullPage: true, mask: [year(page)] });
  });
}
