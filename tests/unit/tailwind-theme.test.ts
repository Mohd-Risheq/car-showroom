import { readFile } from "node:fs/promises";
import path from "node:path";
import { compile } from "tailwindcss";
import { beforeAll, describe, expect, it } from "vitest";

// The Tailwind theme as src/styles/globals.css builds it, compiled with Tailwind's own compiler: each
// namespace keeps only DESIGN's values (D-038), so a class outside them produces nothing, and the
// custom variants compile to valid CSS

const STYLES = path.resolve("src/styles");
const TAILWIND = path.resolve("node_modules/tailwindcss/index.css");

/** Each @import: Tailwind's own stylesheet, or a file beside the one that imports it */
async function loadStylesheet(id: string, base: string) {
  const file = id === "tailwindcss" ? TAILWIND : path.resolve(base, id);
  return { path: file, base: path.dirname(file), content: await readFile(file, "utf8") };
}

let build: (candidates: string[]) => string;
let stylesheet: string;
/** Where Tailwind looks for class names: its source(), "none", or null for the working directory */
let root: { base: string; pattern: string } | "none" | null;

beforeAll(async () => {
  const css = await readFile(path.join(STYLES, "globals.css"), "utf8");
  const compiler = await compile(css, { base: STYLES, loadStylesheet });
  build = (candidates) => compiler.build(candidates);
  stylesheet = build([]);
  root = compiler.root;
});

/** Whether a class adds anything to the stylesheet, which keeps every class built before it */
function adds(candidate: string): boolean {
  const before = stylesheet;
  stylesheet = build([candidate]);
  return stylesheet !== before;
}

describe("the Tailwind theme", () => {
  it("looks for class names in src only, so the docs and the tests add nothing to the stylesheet", () => {
    expect(root !== null && root !== "none" && path.resolve(root.base, root.pattern)).toBe(path.resolve("src"));
  });

  it("compiles the tokens' classes and the project's utilities and variants", () => {
    for (const candidate of [
      "bg-surface-1",
      "text-ink",
      "font-sans",
      "font-display",
      "type-display",
      "figures",
      "p-page",
      "max-w-measure",
      "rounded-input",
      "rounded-full",
      "shadow-overlay",
      "aspect-card",
      "ease-out",
      "duration-(--dur-press)",
      "animate-skeleton",
      "md:flex",
      "hover:bg-surface-3",
      "public:type-small",
      "pressable",
      "surface-edge",
      // Tailwind's system monospace, kept for the development pages
      "font-mono",
    ]) {
      expect(adds(candidate), candidate).toBe(true);
    }
  });

  it("produces nothing for a class outside DESIGN's values", () => {
    for (const candidate of [
      // The eight classes the Phase 0 pages had used (D-038)
      "bg-white",
      "bg-black",
      "border-white",
      "bg-neutral-900",
      "border-neutral-700",
      "max-w-2xl",
      "max-w-4xl",
      "text-black",
      // A default of each namespace the theme empties
      "font-serif",
      "font-bold",
      "max-w-prose",
      "max-w-md",
      "rounded-md",
      "shadow-md",
      "inset-shadow-sm",
      "drop-shadow-md",
      "text-shadow-md",
      "blur-sm",
      "tracking-wide",
      "leading-relaxed",
      "aspect-video",
      "ease-in",
      "animate-ping",
      // A token's name without its variable
      "duration-modal",
    ]) {
      expect(adds(candidate), candidate).toBe(false);
    }
  });

  it("takes the public steps only where <html> has no workspace theme", () => {
    expect(build(["public:type-small"])).toContain(":where(:root:not([data-theme]) *)");
  });

  it("writes the hover variant's media query so that not-hover is valid too", () => {
    expect(build(["hover:bg-surface-3"])).toContain("@media ((hover: hover) and (pointer: fine))");
    expect(build(["not-hover:bg-surface-3"])).toContain("@media not ((hover: hover) and (pointer: fine))");
  });
});
