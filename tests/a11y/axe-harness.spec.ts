import { expect, test } from "@playwright/test";
import { seriousA11yIssues } from "../support/axe.ts";
import { harnessPage } from "../support/harness-pages.ts";

// The axe check of NFR-A11Y-04 on the planted and clean pages in tests/fixtures/checks/axe
// (BUILD-PLAN §6.2): it names each serious or critical issue, and passes a page with none

test("the axe check names every serious or critical issue on the planted page", async ({ page }) => {
  await page.setContent(harnessPage("axe", "planted"));
  expect((await seriousA11yIssues(page)).toSorted()).toStrictEqual([
    expect.stringMatching(/^button-name \(critical\): .+, at button$/),
    expect.stringMatching(/^color-contrast \(serious\): .+, at p$/),
    expect.stringMatching(/^image-alt \(critical\): .+, at img$/),
    expect.stringMatching(/^label \(critical\): .+, at input$/),
  ]);
});

test("the axe check passes the clean page", async ({ page }) => {
  await page.setContent(harnessPage("axe", "clean"));
  expect(await seriousA11yIssues(page)).toStrictEqual([]);
});
