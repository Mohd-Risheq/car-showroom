import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { shown } from "../../../scripts/checks/files.ts";
import { parsePlaceSources, readSeedFiles, SEED_PATHS, type SeedFiles } from "../../../scripts/checks/seed-files.ts";

// The seed's inputs as the seed and pnpm check:seed read them: every file parsed, or every problem
// named with its file and key path

const NOW = new Date("2026-10-18T12:00:00+03:00");
const FIXTURE = fileURLToPath(new URL("../../fixtures/checks/seed/", import.meta.url));
const folders: string[] = [];
afterAll(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
});

/** A copy of the fixture project to change */
function copy(): string {
  const folder = mkdtempSync(path.join(tmpdir(), "muftah-seed-files-"));
  folders.push(folder);
  cpSync(FIXTURE, folder, { recursive: true });
  return folder;
}

type Read = ReturnType<typeof readSeedFiles>;
/** The files read, or a failure that lists the problems */
function filesOf(read: Read): SeedFiles {
  if ("problems" in read) throw new Error(`Problems where none were expected:\n${read.problems.join("\n")}`);
  return read.files;
}
/** The problems, or none when the files were read */
const problemsOf = (read: Read): readonly string[] => ("problems" in read ? read.problems : []);

describe("readSeedFiles", () => {
  it("reads every input of the fixture project, the private VINs among them", () => {
    const files = filesOf(readSeedFiles(FIXTURE, NOW));
    expect(files.cars.map(({ seedKey }) => seedKey)).toStrictEqual(["s01", "s02", "s03"]);
    expect(files.vins).toHaveProperty("s03.vin", "4T1B11HK2JU128781");
    expect(files.sources.map(({ key }) => key)).toStrictEqual(files.places.map(({ key }) => key));
    expect(files.expectations.badges.priceReduced).toStrictEqual(["s02"]);
  });

  it("reads a public clone, which has no private VINs, as having none", () => {
    const folder = copy();
    rmSync(path.join(folder, "seed-private"), { recursive: true });
    expect(filesOf(readSeedFiles(folder, NOW)).vins).toBeNull();
  });

  it("names every file that is missing, isn't JSON or breaks its schema, and reads no file then", () => {
    const folder = copy();
    rmSync(path.join(folder, SEED_PATHS.places));
    writeFileSync(path.join(folder, SEED_PATHS.reference), "{ not json");
    writeFileSync(path.join(folder, SEED_PATHS.vins), JSON.stringify({ s03: { vin: "TOO-SHORT" } }));
    writeFileSync(path.join(folder, SEED_PATHS.sources), "| `amman` | node/1 | north | 35.9 |\n");
    const read = readSeedFiles(folder, NOW);
    expect(read).not.toHaveProperty("files");
    const problems = problemsOf(read);
    const named = (file: string) => problems.filter((problem) => problem.startsWith(shown(path.join(folder, file))));
    expect(named(SEED_PATHS.places)).toStrictEqual([`${shown(path.join(folder, SEED_PATHS.places))} is missing`]);
    expect(named(SEED_PATHS.reference)).toHaveLength(1);
    expect(named(SEED_PATHS.reference)[0]).toContain("not valid JSON");
    expect(named(SEED_PATHS.vins)).toStrictEqual([
      `${shown(path.join(folder, SEED_PATHS.vins))}: s03.vin: Invalid string: must match pattern /^[A-HJ-NPR-Z0-9]{17}$/`,
      `${shown(path.join(folder, SEED_PATHS.vins))}: s03.decoded: Invalid input: expected string, received undefined`,
      `${shown(path.join(folder, SEED_PATHS.vins))}: s03.payload: Invalid input: expected object, received undefined`,
    ]);
    expect(named(SEED_PATHS.sources)).toStrictEqual([
      `${shown(path.join(folder, SEED_PATHS.sources))}: line 1: amman's source doesn't read as an OSM object and two coordinates`,
    ]);
    expect(problems).toHaveLength(6);
  });

  it("names a missing source file as it names a missing JSON file", () => {
    const folder = copy();
    const file = path.join(folder, SEED_PATHS.sources);
    rmSync(file);
    expect(problemsOf(readSeedFiles(folder, NOW))).toStrictEqual([`${shown(file)} is missing`]);
  });

  it("refuses a key the expectations' schema doesn't know", () => {
    const folder = copy();
    const file = path.join(folder, SEED_PATHS.expectations);
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), badge: [] }));
    expect(problemsOf(readSeedFiles(folder, NOW))).toStrictEqual([`${shown(file)}: badge: not a key of this file`]);
  });
});

describe("parsePlaceSources", () => {
  it("reads the table's rows, however Prettier pads them, and skips the prose", () => {
    const markdown = [
      "# Sources",
      "",
      "| Key           | OSM object     | Lat     | Lng      | Note |",
      "| ------------- | -------------- | ------- | -------- | ---- |",
      "| `amman`       | node/1643504896 | 31.9516 | 35.9240  |      |",
      "| `baltimore`   | node/6248418631 | 39.2566 | -76.5322 | Dundalk Marine Terminal |",
    ].join("\n");
    expect(parsePlaceSources(markdown)).toStrictEqual({
      sources: [
        { key: "amman", osm: "node/1643504896", lat: 31.9516, lng: 35.924 },
        { key: "baltimore", osm: "node/6248418631", lat: 39.2566, lng: -76.5322 },
      ],
      problems: [],
    });
  });

  it("names a row whose source or coordinates don't read", () => {
    expect(parsePlaceSources("intro\n| `amman` | street 4 | 31.9 | 35.9 |").problems).toStrictEqual([
      "line 2: amman's source doesn't read as an OSM object and two coordinates",
    ]);
  });
});
