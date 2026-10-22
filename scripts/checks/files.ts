// The project's folder, and how the check scripts read their JSON files: a file that is missing,
// unreadable or not JSON comes back as one line naming it, for the script to print, never as a
// thrown error.
import { readFileSync } from "node:fs";
import path from "node:path";

/** The project's root folder */
export const ROOT = path.join(import.meta.dirname, "..", "..");

/** A path as a problem shows it: from the project's root */
export const shown = (file: string) => path.relative(ROOT, path.resolve(file));

/** An error's message, or what was thrown, as text */
export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** A JSON file's value, or the problem that keeps it from being read */
export function readJson(file: string): { json: unknown } | { problem: string } {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
    return { problem: missing ? `${shown(file)} is missing` : `${shown(file)} can't be read (${errorMessage(error)})` };
  }
  try {
    return { json: JSON.parse(text) };
  } catch (error) {
    return { problem: `${shown(file)}: not valid JSON (${errorMessage(error)})` };
  }
}
