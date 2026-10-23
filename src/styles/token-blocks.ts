// The custom properties a stylesheet sets, block by block, read from its text. tokens.css is where
// the tokens are written, apart from the motion values motion-tokens.ts holds, the font families
// pnpm fonts:fallbacks writes into font-fallbacks.css and the two theme colours theme-color.ts
// repeats, and whatever reads them outside the browser reads them through this: pnpm
// check:contrast, the token tests, and type-scale.ts for the type specimen and the fonts generator.
// Node loads this module from the scripts, so it has no imports. Tested in
// tests/unit/token-blocks.test.ts.

/**
 * Custom properties by the block that sets them. A block is named by the at-rules around it and its
 * selector, as "@media (prefers-contrast: more) :root", and a selector list names one block per
 * selector.
 */
export type TokenBlocks = Map<string, Map<string, string>>;

// An attribute selector, its value quoted either way or not at all
const ATTRIBUTE = /\[\s*([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\]\s"']*))\s*\]/g;

/** A block's name however it is spaced or quoted: whitespace collapsed, attribute values in double quotes */
export function blockName(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .replace(
      ATTRIBUTE,
      (_match, name: string, double?: string, single?: string, bare?: string) =>
        `[${name}="${double ?? single ?? bare ?? ""}"]`,
    );
}

/** The selectors a block's prelude names: a selector list split at its top-level commas, an at-rule whole */
function selectorsOf(prelude: string): string[] {
  const text = blockName(prelude);
  if (text.startsWith("@")) return [text];
  const selectors: string[] = [];
  let nesting = 0;
  let quote = "";
  let start = 0;
  for (let at = 0; at < text.length; at++) {
    const char = text.charAt(at);
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "(" || char === "[") {
      nesting++;
    } else if (char === ")" || char === "]") {
      nesting--;
    } else if (char === "," && nesting === 0) {
      selectors.push(text.slice(start, at).trim());
      start = at + 1;
    }
  }
  return [...selectors, text.slice(start).trim()];
}

/** The custom properties a stylesheet sets, by block, and anything that kept it from being read */
export function tokenBlocks(css: string): { blocks: TokenBlocks; problems: string[] } {
  const blocks: TokenBlocks = new Map();
  const problems: string[] = [];
  const open: Array<{ names: string[]; line: number }> = [];
  let text = "";
  let line = 1;
  let quote = { char: "", line: 0 };
  let parentheses = 0;

  // Later declarations win, within a block and across blocks of the same name
  const declare = () => {
    const colon = text.indexOf(":");
    const name = colon === -1 ? "" : text.slice(0, colon).trim();
    if (name.startsWith("--")) {
      const value = text
        .slice(colon + 1)
        .replace(/!\s*important\s*$/i, "")
        .trim();
      for (const block of open.at(-1)?.names ?? []) {
        const tokens = blocks.get(block) ?? new Map<string, string>();
        tokens.set(name, value);
        blocks.set(block, tokens);
      }
    }
    text = "";
  };
  const openBlock = () => {
    const parents = open.at(-1)?.names ?? [""];
    const selectors = selectorsOf(text);
    const names = parents.flatMap((parent) => selectors.map((selector) => `${parent} ${selector}`.trim()));
    open.push({ names, line });
    text = "";
  };
  const closeBlock = () => {
    declare();
    if (open.pop() === undefined) problems.push(`line ${line}: this } closes no block`);
  };

  for (let at = 0; at < css.length; at++) {
    const char = css.charAt(at);
    if (char === "\n") line++;
    if (quote.char) {
      text += char;
      if (char === "\\") {
        at++;
        text += css.charAt(at);
        if (css.charAt(at) === "\n") line++;
      } else if (char === quote.char) {
        quote = { char: "", line: 0 };
      }
    } else if (char === "/" && css.charAt(at + 1) === "*") {
      const end = css.indexOf("*/", at + 2);
      if (end === -1) {
        problems.push(`line ${line}: this comment is never closed`);
        break;
      }
      line += css.slice(at, end).split("\n").length - 1;
      at = end + 1;
      text += " ";
    } else if (parentheses === 0 && char === "{") {
      openBlock();
    } else if (parentheses === 0 && char === ";") {
      declare();
    } else if (parentheses === 0 && char === "}") {
      closeBlock();
    } else {
      if (char === '"' || char === "'") quote = { char, line };
      if (char === "(") parentheses++;
      if (char === ")") parentheses = Math.max(parentheses - 1, 0);
      text += char;
    }
  }
  if (quote.char) problems.push(`line ${quote.line}: this string is never closed`);
  for (const block of open) problems.push(`line ${block.line}: ${block.names.join(", ")} { is never closed`);
  return { blocks, problems };
}
