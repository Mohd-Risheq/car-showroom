import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

// NFR-A11Y-04: axe-core with the WCAG 2.0 A and AA, 2.1 AA and 2.2 AA rules. A screen passes with
// no serious or critical issue, in both locales.
export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

/**
 * The one finding left out, by the owner's choice (D-038): in Safari, Base UI gives the focus guards
 * around an open dialog role="button" with no name, so VoiceOver's cursor stays inside the dialog,
 * and axe reports them under aria-command-name. The rule still applies to every other element.
 */
function isBaseUiFocusGuard(rule: string, html: string): boolean {
  return rule === "aria-command-name" && /\sdata-base-ui-focus-guard=/.test(html);
}

/** The page's serious and critical axe issues, one line each: rule, impact, help and where */
export async function seriousA11yIssues(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  return violations
    .filter(({ impact }) => impact === "serious" || impact === "critical")
    .map((violation) => ({
      ...violation,
      nodes: violation.nodes.filter(({ html }) => !isBaseUiFocusGuard(violation.id, html)),
    }))
    .filter(({ nodes }) => nodes.length > 0)
    .map(({ id, impact, help, nodes }) => {
      const where = nodes.map(({ target }) => target.join(" ")).join(", ");
      return `${id} (${impact}): ${help}, at ${where}`;
    });
}
