import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";

// Zod checks whether it may compile a parser with new Function when the first object schema is
// built, and compiles one at the first parse. A Content Security Policy without unsafe-eval
// reports each attempt, though Zod catches the failure (SRS §12.5). The z of lib/validation never
// compiles one. Each count runs in a fresh Node, as Zod remembers its check.

/** The functions a fresh Node builds while an object schema is built and parsed with the z of a module */
function functionsBuilt(module: string): number {
  const script = `
    let built = 0;
    globalThis.Function = new Proxy(Function, {
      construct(target, args) { built += 1; return Reflect.construct(target, args); },
      apply(target, self, args) { built += 1; return Reflect.apply(target, self, args); },
    });
    const { z } = await import(${JSON.stringify(module)});
    z.object({ name: z.string(), year: z.number() }).parse({ name: "Muftah", year: 2026 });
    console.log(built);`;
  const run = spawnSync(process.execPath, ["--input-type=module", "--eval", script], { encoding: "utf8" });
  expect(run.stderr).toBe("");
  return Number(run.stdout.trim());
}

it("builds and parses object schemas without compiling a function", () => {
  expect(functionsBuilt(pathToFileURL("src/lib/validation/zod.ts").href)).toBe(0);
});

it("needs its setting, as Zod's own z compiles one", () => {
  expect(functionsBuilt("zod")).toBeGreaterThan(0);
});
