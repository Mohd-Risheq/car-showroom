// How the check scripts write words: a list in a sentence, and the comment a generated CSS file opens
// with. Node loads the scripts' modules by their .ts paths, so this has no imports. Tested in
// tests/unit/checks/text.test.ts.

/** Items in a list, as a sentence writes them: "body", "body and small", "40, 60 and 80" */
export function inWords(items: ReadonlyArray<string | number>): string {
  return items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${String(items.at(-1))}` : items.join("");
}

/** A CSS comment of lines, each under the first's text, as Prettier leaves a generated file's */
export function cssComment(lines: readonly string[]): string {
  return `/* ${lines.join("\n   ")} */`;
}
