"use client";

import { useSyncExternalStore } from "react";
import { noChanges } from "@/app/_dev/harness";

// Every custom property the page's stylesheets declare, block by block, read from the stylesheets
// the browser loaded: the specimen's record that it covers every token (T-13), with no list to keep
// up to date. Tailwind's own --tw-* variables, and the --lightningcss-* pair that Lightning CSS adds
// beside color-scheme when it minifies, are left out.

type Block = { scope: string; tokens: Array<[name: string, value: string]> };

/** Custom properties the build adds, which no stylesheet of ours declares */
const BUILD_VARIABLES = /^--(?:tw|lightningcss)-/;

let declared: Block[] | null = null;

function snapshot(): Block[] {
  declared ??= collect();
  return declared;
}

function collect(): Block[] {
  const found = new Map<string, Map<string, string>>();
  const visit = (rules: CSSRuleList, conditions: string[]) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        const scope = [...conditions, rule.selectorText].join(" ");
        for (const name of rule.style) {
          if (!name.startsWith("--") || BUILD_VARIABLES.test(name)) continue;
          const tokens = found.get(scope) ?? new Map<string, string>();
          tokens.set(name, rule.style.getPropertyValue(name).trim());
          found.set(scope, tokens);
        }
        visit(rule.cssRules, [...conditions, rule.selectorText]);
      } else if (rule instanceof CSSGroupingRule) {
        visit(rule.cssRules, [...conditions, condition(rule)]);
      }
    }
  };
  for (const sheet of document.styleSheets) visit(sheet.cssRules, []);
  return [...found].map(([scope, tokens]) => ({ scope, tokens: [...tokens] }));
}

function condition(rule: CSSGroupingRule): string {
  if (rule instanceof CSSMediaRule) return `@media ${rule.conditionText}`;
  if (rule instanceof CSSSupportsRule) return `@supports ${rule.conditionText}`;
  if (rule instanceof CSSLayerBlockRule) return `@layer ${rule.name}`;
  return `@${rule.constructor.name}`;
}

export function TokenList() {
  const blocks = useSyncExternalStore(noChanges, snapshot, () => null);
  if (!blocks) return null;
  const count = blocks.reduce((sum, block) => sum + block.tokens.length, 0);

  return (
    <div lang="en" dir="ltr" className="grid gap-4">
      <p className="font-mono text-sm text-muted" data-token-count={count}>
        {count} declarations in {blocks.length} blocks
      </p>
      {blocks.map((block) => (
        <details key={block.scope} open className="grid gap-2">
          <summary className="font-mono text-sm">{block.scope}</summary>
          <table className="font-mono text-xs">
            <tbody>
              {block.tokens.map(([name, value]) => (
                <tr key={name} data-token={name}>
                  <th scope="row" className="pe-4 text-start font-normal">
                    {name}
                  </th>
                  <td className="text-muted">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
    </div>
  );
}
