import { describe, expect, it } from "vitest";
import {
  clipFile,
  clipOfFile,
  type ClipName,
  ENGINE_CLIPS,
  SPIN_FORMATS,
  SPIN_SETS,
  SPIN_WIDTHS,
  type SpinSetName,
  spinFrameFile,
  spinFrameFormat,
} from "@/app/_dev/fixtures";

// The fixture catalogue: the dev routes serve exactly the files the fixture scripts write, so a
// page never asks for a name the script didn't write, and a route never serves anything else

describe("spin frame files", () => {
  it("recognises every frame the spin script writes, with its format", () => {
    for (const set of Object.keys(SPIN_SETS) as SpinSetName[]) {
      for (let index = 0; index < SPIN_SETS[set].frames; index++) {
        for (const width of [SPIN_WIDTHS.low, SPIN_WIDTHS.high]) {
          for (const format of SPIN_FORMATS) {
            expect(spinFrameFormat(spinFrameFile(set, index, width, format))).toBe(format);
          }
        }
      }
    }
  });

  it.each([
    ["a frame past the set's end", "l36-36-480.webp"],
    ["an unknown set", "x36-00-480.webp"],
    ["another width", "l36-00-960.webp"],
    ["another format", "l36-00-480.png"],
    ["a one-digit index", "l36-0-480.webp"],
    ["a three-digit index", "l36-000-480.webp"],
    ["a width with a leading zero", "l36-00-0480.webp"],
    ["a parent folder", "../l36-00-480.webp"],
    ["the manifest", "manifest.json"],
  ])("refuses %s", (_case, file) => {
    expect(spinFrameFormat(file)).toBeUndefined();
  });
});

describe("clip files", () => {
  it("recognises every clip the sound script writes", () => {
    for (const clip of Object.keys(ENGINE_CLIPS) as ClipName[]) expect(clipOfFile(clipFile(clip))).toBe(clip);
  });

  it.each(["steps-8s", "steps-8s.mp3", "steps-9s.wav", "../steps-8s.wav", "manifest.json"])("refuses %s", (file) => {
    expect(clipOfFile(file)).toBeUndefined();
  });
});
