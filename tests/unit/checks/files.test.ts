import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { errorMessage, readJson, readText, ROOT, shown } from "../../../scripts/checks/files.ts";

// How the check scripts read their files: a value, or one line naming the file and what is wrong
// with it, never a thrown error

const folder = mkdtempSync(path.join(tmpdir(), "muftah-check-files-"));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

function file(name: string, text: string): string {
  const full = path.join(folder, name);
  writeFileSync(full, text);
  return full;
}

describe("readText", () => {
  it("gives a file's text, and names a file that is missing or can't be read", () => {
    expect(readText(file("note.md", "| `amman` |\n"))).toStrictEqual({ text: "| `amman` |\n" });
    const missing = path.join(folder, "missing.md");
    expect(readText(missing)).toStrictEqual({ problem: `${shown(missing)} is missing` });
    const inner = path.join(folder, "a-folder.md");
    mkdirSync(inner);
    expect(readText(inner)).toStrictEqual({ problem: expect.stringMatching(/^.*a-folder\.md can't be read \(EISDIR/) });
  });
});

describe("readJson", () => {
  it("gives a file's value", () => {
    expect(readJson(file("list.json", '{ "keys": ["a"] }'))).toStrictEqual({ json: { keys: ["a"] } });
  });

  it("names a missing file", () => {
    const missing = path.join(folder, "missing.json");
    expect(readJson(missing)).toStrictEqual({ problem: `${shown(missing)} is missing` });
  });

  it("names a file it can't read", () => {
    const inner = path.join(folder, "a-folder.json");
    mkdirSync(inner);
    expect(readJson(inner)).toStrictEqual({
      problem: expect.stringMatching(/^.*a-folder\.json can't be read \(EISDIR/),
    });
  });

  it("names a file that isn't JSON, with the parser's reason", () => {
    const broken = file("broken.json", '{ "keys": [');
    expect(readJson(broken)).toStrictEqual({ problem: expect.stringContaining(`${shown(broken)}: not valid JSON (`) });
  });
});

describe("shown", () => {
  it("shows a path from the project's root", () => {
    expect(shown(path.join(ROOT, "scripts", "perf-budgets.json"))).toBe(path.join("scripts", "perf-budgets.json"));
    expect(shown("scripts/perf-budgets.json")).toBe(path.join("scripts", "perf-budgets.json"));
  });
});

describe("errorMessage", () => {
  it("gives an error's message, or what was thrown as text", () => {
    expect(errorMessage(new TypeError("Load failed"))).toBe("Load failed");
    expect(errorMessage("stopped")).toBe("stopped");
  });
});
