import { defineConfig, devices } from "@playwright/test";
import { CHROMIUM_FLAGS } from "./scripts/checks/chromium.ts";
import { e2eStore } from "./tests/support/e2e-store.ts";

// Playwright (SRS §16.1, BUILD-PLAN §6.1): journeys, axe and visual tests on the production build
// (pnpm build, then pnpm e2e), with the local storage adapter in a fresh temporary folder each run.
// Chromium and WebKit run at 1440 and 360 px, Firefox at 1440. WebKit goes through
// tests/support/https-proxy.ts, because it upgrades http://localhost to HTTPS (D-028). Chromium is
// the full build (channel "chromium"), which sends CSP reports and draws on the GPU (D-028, D-031).
// Chromium and Firefox run muted with a fake camera, so no test plays sound on the machine or opens
// its camera. WebKit can't be muted, so a test that plays sound runs in the other two.
//
// Visual baselines come from Playwright's pinned Linux image only, so the visual tests run only with
// pnpm e2e:linux, which connects to browsers in that image, here and in CI (D-037). Firefox doesn't
// start on macOS 27 (D-026), so on a Mac it runs only there too.

const PORT = 3000;
const HTTPS_PORT = 3443;
const STORE = e2eStore();
// Set by pnpm e2e:linux to the image it runs the browsers in. Another remote browser has no baselines
// here, so connecting to one doesn't turn the visual tests on.
const pinnedImage = Boolean(process.env.MUFTAH_E2E_IMAGE);
const firefoxStarts = pinnedImage || process.platform !== "darwin";
// Said once, by the runner rather than each worker, so a green run here isn't read as the full suite
if (!pinnedImage && !process.env.TEST_WORKER_INDEX) {
  const leftOut = firefoxStarts ? "the visual tests" : "Firefox and the visual tests";
  console.log(`e2e: ${leftOut} run only with pnpm e2e:linux, in Playwright's pinned Linux image`);
}

const chromium = {
  channel: "chromium",
  launchOptions: { args: [...CHROMIUM_FLAGS] },
};
const firefox = {
  launchOptions: {
    firefoxUserPrefs: {
      "media.volume_scale": "0.0",
      "media.navigator.streams.fake": true,
      "media.navigator.permission.disabled": true,
    },
  },
};
const overHttps = { baseURL: `https://localhost:${HTTPS_PORT}`, ignoreHTTPSErrors: true };
const desktop = { viewport: { width: 1440, height: 900 } };
// The narrowest width every public screen is checked at (SRS §16.1, DESIGN §10.2)
const phone = { viewport: { width: 360, height: 780 } };

export default defineConfig({
  testDir: "tests",
  testMatch: ["e2e/**/*.spec.ts", "a11y/**/*.spec.ts", ...(pinnedImage ? ["visual/**/*.spec.ts"] : [])],
  outputDir: "test-results",
  globalTeardown: "./tests/support/e2e-store.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["json", { outputFile: "reports/playwright.json" }],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Browsers whose first language is Arabic, so Arabic pages don't offer English (FR-01.2a); a test of
    // that offer sets its own
    locale: "ar-JO",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Approved baselines per screen and project (SRS §16.2 step 6). CI never writes one; a local run
  // writes a missing one but fails, so it is looked at before it is committed.
  snapshotPathTemplate: "{testDir}/visual/__screenshots__/{projectName}/{testFileName}/{arg}{ext}",
  updateSnapshots: process.env.CI ? "none" : "default",
  // Animations off, the caret hidden and CSS pixels are Playwright's defaults, set here so a new version
  // can't change them. A screen may differ from its baseline in at most 0.2% of its pixels, which
  // absorbs antialiasing, and a pixel differs only past the default colour threshold, so a small tint
  // change doesn't count.
  expect: { toHaveScreenshot: { animations: "disabled", caret: "hide", scale: "css", maxDiffPixelRatio: 0.002 } },
  webServer: [
    {
      command: `pnpm exec next start -H 127.0.0.1 -p ${PORT}`,
      url: `http://localhost:${PORT}/en`,
      // Better Auth trusts BETTER_AUTH_URL's origin; WebKit's pages come from the HTTPS front too
      env: {
        STORAGE_DRIVER: "local",
        STORAGE_LOCAL_ROOT: STORE,
        BETTER_AUTH_TRUSTED_ORIGINS: `https://localhost:${HTTPS_PORT}`,
      },
      // A server already on the port could be an older build, so it fails rather than reuse it
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    },
    {
      command: `node tests/support/https-proxy.ts ${HTTPS_PORT} ${PORT}`,
      url: `https://localhost:${HTTPS_PORT}/en`,
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 2000 },
    },
  ],
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"], ...chromium, ...desktop } },
    { name: "chromium-phone", use: { ...devices["Pixel 7"], ...chromium, ...phone } },
    { name: "webkit-desktop", use: { ...devices["Desktop Safari"], ...overHttps, ...desktop } },
    { name: "webkit-phone", use: { ...devices["iPhone 15"], ...overHttps, ...phone } },
    ...(firefoxStarts
      ? [{ name: "firefox-desktop", use: { ...devices["Desktop Firefox"], ...firefox, ...desktop } }]
      : []),
  ],
});
