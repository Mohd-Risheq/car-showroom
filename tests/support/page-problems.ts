import { type ConsoleMessage, expect, type Page } from "@playwright/test";

declare global {
  interface Window {
    /** Every Content Security Policy violation on the page, as "directive blocked-uri" */
    policyViolations: string[];
  }
}

/**
 * The one console error that isn't the page's: WebKit's Linux port, which Playwright's Linux image and
 * CI run, doesn't know SRS §9.4's interactive-widget key and says so on every page, where WebKit's Mac
 * build, as Safari's, knows it (the owner, 2026-10-30, D-047). Any other message counts, about the
 * viewport or not. tests/e2e/problems-harness.spec.ts holds it.
 */
const UNKNOWN_VIEWPORT_KEY = 'Viewport argument key "interactive-widget" not recognized and ignored.';

/**
 * What a browser reports for a document that answers 404, as the site's 404 does on purpose: Chromium
 * on every visit, WebKit on every one but a tab's first, Firefox never (D-047). The status is the
 * test's to check, so the report doesn't count at the address of a document that answered 404. It
 * counts anywhere else, as for an image that answered 404, and so does a report of another status.
 * tests/e2e/problems-harness.spec.ts holds it too.
 */
const NOT_FOUND_REPORT = "Failed to load resource: the server responded with a status of 404 (Not Found)";

/**
 * An error logged whole, as Firefox words it, where Chromium and WebKit give its kind and its
 * message: "Error", or for a kind Firefox doesn't mark as an error, as a RangeError,
 * "JSHandle@object", Playwright's word for an object it can't preview. The check reads the words
 * from the error, so a test expects the same in every browser. tests/e2e/problems-harness.spec.ts
 * holds it.
 */
const ERROR_UNWORDED = /^(?:Error|JSHandle@object)$/;

/** The reads of errors logged whole still under way, by page */
const reading = new WeakMap<Page, Promise<void>[]>();

/**
 * What the error a message logs first says, its kind and its message, or null for anything else. A
 * handle the page let go of before it was read, as on a navigation, gives null too: the problem
 * keeps the console's words, and counts all the same.
 */
async function wordsOf(message: ConsoleMessage): Promise<string | null> {
  const [logged] = message.args();
  if (logged === undefined) return null;
  return logged
    .evaluate((value) => (value instanceof Error ? `${value.name}: ${value.message}` : null))
    .catch(() => null);
}

/**
 * Collects page errors, console errors and Content Security Policy violations from the next
 * navigation on: the problems it returns, and the violations in window.policyViolations. The list
 * fills as the page reports, and an error logged whole takes its words once they are read, which
 * expectProblems waits for.
 */
export async function watchProblems(page: Page): Promise<string[]> {
  const problems: string[] = [];
  const reads: Promise<void>[] = [];
  reading.set(page, reads);
  // The documents that answered 404. A browser reports a status once the response has come, so a
  // document is here before its report; were it ever not, the report would count and fail the test.
  const notFound = new Set<string>();
  page.on("response", (response) => {
    if (response.status() === 404 && response.request().isNavigationRequest()) notFound.add(response.url());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    const text = message.text();
    const { url } = message.location();
    if (message.type() !== "error" || text === UNKNOWN_VIEWPORT_KEY) return;
    if (text === NOT_FOUND_REPORT && notFound.has(url)) return;
    const place = problems.push(`${text} (${url})`) - 1;
    if (!ERROR_UNWORDED.test(text)) return;
    reads.push(
      wordsOf(message).then((words) => {
        if (words !== null) problems[place] = `${words} (${url})`;
      }),
    );
  });
  await page.addInitScript(() => {
    window.policyViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.policyViolations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  return problems;
}

/**
 * Expects the problems collected, but those a pattern ignored matches, to be the ones given, none
 * by default, a pattern standing for one problem that it matches, and no policy violation. It reads
 * them once each error logged whole has its words, so a pattern meets those, not the console's.
 */
export async function expectProblems(
  page: Page,
  problems: string[],
  expected: (string | RegExp)[] = [],
  { ignoring = [] }: { ignoring?: RegExp[] } = {},
): Promise<void> {
  await Promise.all(reading.get(page) ?? []);
  const counted = problems.filter((problem) => !ignoring.some((pattern) => pattern.test(problem)));
  const matchers = expected.map((problem) => (typeof problem === "string" ? problem : expect.stringMatching(problem)));
  expect(counted).toStrictEqual(matchers);
  expect(await page.evaluate(() => window.policyViolations)).toStrictEqual([]);
}
