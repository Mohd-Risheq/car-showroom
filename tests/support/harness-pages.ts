import { readFileSync } from "node:fs";
import path from "node:path";

// The planted and clean pages of the Playwright harnesses (BUILD-PLAN §6.2), in
// tests/fixtures/checks/<check>, found from this file rather than from the working directory
const CHECKS = path.join(import.meta.dirname, "../fixtures/checks");

/** The HTML of a harness's planted or clean page */
export function harnessPage(check: "axe" | "visual", name: "planted" | "clean"): string {
  return readFileSync(path.join(CHECKS, check, `${name}.html`), "utf8");
}
