import type { Page } from "@playwright/test";

declare global {
  interface Window {
    /** Every Content Security Policy violation on the page, as "directive blocked-uri" */
    policyViolations: string[];
  }
}

/**
 * Collects page errors, console errors and Content Security Policy violations from the next
 * navigation on: the problems it returns, and the violations in window.policyViolations
 */
export async function watchProblems(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`${message.text()} (${message.location().url})`);
  });
  await page.addInitScript(() => {
    window.policyViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.policyViolations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  return problems;
}
