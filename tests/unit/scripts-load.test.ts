import { spawnSync } from "node:child_process";
import { globSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";

// The scripts run under plain Node, which strips the types but, unlike Next.js and Vitest, resolves
// neither the @/ alias nor a path without its extension. So each module of src that a script
// imports must load in Node: it imports types only, or other modules by their relative .ts paths.

/** The modules of src that the scripts import, as absolute paths */
function srcModulesOfScripts(): string[] {
  const modules = globSync("scripts/**/*.ts").flatMap((script) =>
    Array.from(readFileSync(script, "utf8").matchAll(/from "((?:\.\.\/)+src\/[^"]+)"/g), ([, specifier = ""]) =>
      path.resolve(path.dirname(script), specifier),
    ),
  );
  return [...new Set(modules)].sort();
}

it("loads every module of src that a script imports, in plain Node", () => {
  const modules = srcModulesOfScripts();
  expect(modules.length).toBeGreaterThan(0);
  const imports = modules.map((file) => `await import(${JSON.stringify(pathToFileURL(file).href)});`).join("\n");
  const run = spawnSync(process.execPath, ["--input-type=module", "--eval", imports], { encoding: "utf8" });
  expect(run.stderr).toBe("");
  expect(run.status).toBe(0);
});
