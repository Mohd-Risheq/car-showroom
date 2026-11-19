// Reading a part's rendered markup in a unit test. A helper that finds nothing fails the test, so
// an assertion never passes on an empty read.

/** The markup of the first element with the tag */
export function element(html: string, tag: string): string {
  const found = new RegExp(`<${tag}[ >][\\s\\S]*?</${tag}>`).exec(html);
  if (found === null) throw new Error(`No <${tag}> in ${html}`);
  return found[0];
}

/** What the pattern's first group matches in the markup, named for the failure */
export function partOf(html: string, pattern: RegExp, name: string): string {
  const found = pattern.exec(html)?.[1];
  if (found === undefined) throw new Error(`No ${name} in ${html}`);
  return found;
}

/** An element's text, its tags taken out */
export const textOf = (html: string) => html.replace(/<[^>]*>/g, "");
