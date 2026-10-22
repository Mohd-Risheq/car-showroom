// pnpm check:dashes (C-07): no em dash, en dash or other long dash in user-facing text, which is
// the message catalogs (messages/*.json), MDX content anywhere in the project, the seed data
// (seed/*.json) and the seed credits (public/seed/credits.json). Each dash is named with its file
// and its key path or line, and the check exits 1. Given paths, it checks those files and the
// JSON and MDX files in those folders instead, as T-12's planted violations do.
//
// Usage: pnpm check:dashes [path...]
import { readFileSync } from "node:fs";
import { dashesInJson, dashesInMdx, dashSources } from "./checks/dashes.ts";
import { readJson, ROOT, shown } from "./checks/files.ts";

function problemsIn(file: string): string[] {
  if (file.endsWith(".mdx")) {
    return dashesInMdx(readFileSync(file, "utf8")).map(({ line, column, written, dash }) =>
      written.length === 1
        ? `${shown(file)}:${line}:${column}: ${dash}`
        : `${shown(file)}:${line}:${column}: ${written}, ${dash}`,
    );
  }
  const read = readJson(file);
  if ("problem" in read) return [read.problem];
  return dashesInJson(read.json).map(
    ({ path: key, dash, excerpt }) =>
      `${shown(file)}: ${key || "(the whole file)"}: ${dash} in ${JSON.stringify(excerpt)}`,
  );
}

const files = dashSources(ROOT, process.argv.slice(2)).sort();
const problems = files.flatMap(problemsIn);
for (const problem of problems) console.error(problem);
if (problems.length > 0) process.exitCode = 1;
else console.log(`check:dashes: no dashes in ${files.length} ${files.length === 1 ? "file" : "files"} (C-07)`);
