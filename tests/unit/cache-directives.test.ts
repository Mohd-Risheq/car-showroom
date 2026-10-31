import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// SRS §11.4: the public data comes from cached functions, each "use cache: remote", the store shared
// across instances on Vercel, where the default store is each instance's own, and each with
// cacheLife("catalog"). A directive is a string only Next.js's compiler reads, inert under Vitest, so
// this reads the source, as dev-guard.test.ts does. A cached function that reads no data may keep the
// default store, with its reason here.

const NOT_DATA = new Map([["src/features/shell/server/year.ts", "this year in Amman, from the clock (D-047)"]]);

/** Every TypeScript or JavaScript file under a folder, by its path from the repository's root */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [full] : [];
  });
}

/** Each cache directive in a source, with the statement after it */
function directives(source: string): { directive: string; next: string }[] {
  return Array.from(source.matchAll(/^\s*"(use cache[^"]*)";\n\s*(.*)$/gm), ([, directive = "", next = ""]) => ({
    directive,
    next,
  }));
}

const cached = sources("src").filter((file) => readFileSync(file, "utf8").includes('"use cache'));

describe("cached functions (SRS §11.4)", () => {
  it("are found, the public reads among them", () => {
    expect(cached).toEqual(
      expect.arrayContaining([
        "src/features/settings/server/public-settings.ts",
        "src/features/settings/server/dealer-id.ts",
        "src/features/car-page/server/car-page.ts",
        "src/features/inventory/server/inventory-index.ts",
      ]),
    );
  });

  it.each(cached)("%s caches in the shared store, for the catalog's life", (file) => {
    const source = readFileSync(file, "utf8");
    const found = directives(source);
    expect(found.length).toBeGreaterThan(0);
    // Every directive at a line's start is read, as one with a comment after it would otherwise not be
    expect(found).toHaveLength(source.match(/^\s*"use cache/gm)?.length ?? 0);
    for (const { directive, next } of found) {
      expect(directive, NOT_DATA.get(file) ?? "public data").toBe(
        NOT_DATA.has(file) ? "use cache" : "use cache: remote",
      );
      expect(next).toBe('cacheLife("catalog");');
    }
  });
});
