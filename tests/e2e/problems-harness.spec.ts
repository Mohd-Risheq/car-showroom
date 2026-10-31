import { expect, test } from "@playwright/test";
import { harnessPage } from "../support/harness-pages.ts";
import { watchProblems } from "../support/page-problems.ts";

// The e2e suites' problem check (tests/support/page-problems.ts) on the pages in
// tests/fixtures/checks/problems (BUILD-PLAN §6.2): it counts every page error and console error but
// the two it lets through (D-047). One is WebKit's Linux port not knowing SRS §9.4's viewport key,
// which that port gives for the clean page's own viewport too; another message about the same key,
// as a bad value's, counts. The other is a browser's report of a document's own 404, at the address
// of a document that answered 404; the same report where a document answered 200 counts, and so do a
// report of another status and the report of an image that answered 404.

test("the problem check counts every page and console error on the planted page but that notice", async ({ page }) => {
  const problems = await watchProblems(page);
  await page.setContent(harnessPage("problems", "planted"));
  await expect.poll(() => problems.length).toBe(4);
  expect(problems).toStrictEqual([
    expect.stringMatching(/^Viewport argument key "made-up-key" not recognized and ignored\. \(/),
    expect.stringMatching(/^Viewport argument value "overlays-everything" for key "interactive-widget" is invalid/),
    expect.stringMatching(/^A planted console error \(/),
    "A planted page error",
  ]);
});

test("the problem check lets a report of 404 through only where a document answered 404", async ({ page }) => {
  const problems = await watchProblems(page);
  // The page of status reports, at an address that answers 404 and at one that answers 200
  await page.route("**/harness/*", (route) =>
    route.fulfill({
      status: route.request().url().endsWith("/harness/missing") ? 404 : 200,
      contentType: "text/html",
      body: harnessPage("problems", "status"),
    }),
  );
  await page.goto("/harness/missing");
  await page.goto("/harness/found");
  await expect.poll(() => problems.length).toBe(3);
  expect(problems).toStrictEqual([
    expect.stringMatching(/ status of 500 \(Internal Server Error\) \(\S+\/harness\/missing\)$/),
    expect.stringMatching(/ status of 404 \(Not Found\) \(\S+\/harness\/found\)$/),
    expect.stringMatching(/ status of 500 \(Internal Server Error\) \(\S+\/harness\/found\)$/),
  ]);
});

test("the problem check counts the report of an image that answered 404", async ({ page, browserName }) => {
  test.skip(browserName === "firefox", "Firefox reports no load that fails");
  const problems = await watchProblems(page);
  await page.route("**/harness/*", (route) =>
    route.request().resourceType() === "image"
      ? route.fulfill({ status: 404 })
      : route.fulfill({ contentType: "text/html", body: harnessPage("problems", "image") }),
  );
  await page.goto("/harness/page");
  await expect.poll(() => problems.length).toBe(1);
  expect(problems).toStrictEqual([
    expect.stringMatching(/ status of 404 \(Not Found\) \(\S+\/harness\/missing\.png\)$/),
  ]);
});

test("the problem check passes the clean page, SRS §9.4's viewport and all", async ({ page }) => {
  const problems = await watchProblems(page);
  await page.setContent(harnessPage("problems", "clean"));
  // A round trip to the page, so the console messages its parsing sent have arrived
  expect(await page.evaluate(() => document.readyState)).toBe("complete");
  expect(problems).toStrictEqual([]);
});
