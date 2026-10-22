import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

// NFR-A11Y-04: axe-core with the WCAG 2.0 A and AA, 2.1 AA and 2.2 AA rules. A screen passes with
// no serious or critical issue, in both locales.
export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

/** The page's serious and critical axe issues, one line each: rule, impact, help and where */
export async function seriousA11yIssues(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  return violations
    .filter(({ impact }) => impact === "serious" || impact === "critical")
    .map(({ id, impact, help, nodes }) => {
      const where = nodes.map(({ target }) => target.join(" ")).join(", ");
      return `${id} (${impact}): ${help}, at ${where}`;
    });
}
