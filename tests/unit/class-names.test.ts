import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cn } from "@/lib/class-names";
import { tokenBlocks } from "@/styles/token-blocks";

// cn() has to know every name the Tailwind theme gives a token, or it keeps two classes that set
// the same property and the stylesheet's order decides between them

/** Each theme variable the stylesheets declare, as [namespace, name]: --radius-input is ["radius", "input"] */
function themeNames(): Array<[string, string]> {
  const names: Array<[string, string]> = [];
  for (const file of ["src/styles/tokens.css", "src/styles/font-fallbacks.css"]) {
    const { blocks, problems } = tokenBlocks(readFileSync(file, "utf8"));
    expect(problems).toEqual([]);
    for (const [block, tokens] of blocks) {
      if (!block.startsWith("@theme")) continue;
      for (const [name, value] of tokens) {
        const match = /^--(color|font-weight|font|text|spacing|container|radius|aspect|shadow|ease|animate)-(.+)$/.exec(
          name,
        );
        // A namespace reset, or a single default the theme removes, isn't a token
        if (match?.[1] && match[2] && !match[2].endsWith("*") && value !== "initial") names.push([match[1], match[2]]);
      }
    }
  }
  return names;
}

// A class of each namespace with a name that isn't a token, which a token's class must replace
const EARLIER: Record<string, (name: string) => [earlier: string, later: string]> = {
  color: (name) => [`bg-[red]`, `bg-${name}`],
  "font-weight": (name) => ["font-[450]", `font-${name}`],
  font: (name) => ["font-mono", `font-${name}`],
  text: (name) => ["text-[1px]", `text-${name}`],
  spacing: (name) => ["p-4", `p-${name}`],
  container: (name) => ["max-w-none", `max-w-${name}`],
  radius: (name) => ["rounded-full", `rounded-${name}`],
  aspect: (name) => ["aspect-square", `aspect-${name}`],
  shadow: (name) => ["shadow-none", `shadow-${name}`],
  ease: (name) => ["ease-linear", `ease-${name}`],
  animate: (name) => ["animate-none", `animate-${name}`],
};

describe("cn", () => {
  it("lets each token's class replace an earlier class of its kind", () => {
    const names = themeNames();
    expect(names.length).toBeGreaterThan(40);
    for (const [namespace, name] of names) {
      const pair = EARLIER[namespace]?.(name);
      if (!pair) throw new Error(`no test class for --${namespace}-${name}`);
      expect(cn(...pair), `--${namespace}-${name}`).toBe(pair[1]);
    }
  });

  it("treats a type step as setting the family, size, line height, weight, tracking and wrap", () => {
    expect(cn("type-body", "type-small")).toBe("type-small");
    // The display step sets all six
    expect(
      cn(
        "font-sans text-sm leading-(--display-leading) tracking-(--display-tracking) font-medium text-balance",
        "type-display",
      ),
    ).toBe("type-display");
    // A later class still adjusts one part of a step
    expect(cn("type-small", "font-medium")).toBe("type-small font-medium");
  });

  it("treats figures as setting the family and weight, at the size of the step around them", () => {
    expect(cn("font-sans", "figures")).toBe("figures");
    expect(cn("font-medium", "figures")).toBe("figures");
    expect(cn("type-body", "figures")).toBe("type-body figures");
    expect(cn("figures", "type-small")).toBe("figures type-small");
  });

  it("knows the static values Tailwind keeps in an emptied namespace", () => {
    expect(cn("perspective-none", "perspective-(--depth)")).toBe("perspective-(--depth)");
  });

  it("joins conditional classes as clsx does", () => {
    const loading = false;
    expect(cn("pressable", loading && "opacity-40", { "text-muted": true }, undefined)).toBe("pressable text-muted");
  });
});
