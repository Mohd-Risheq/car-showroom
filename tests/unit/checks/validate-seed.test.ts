import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { shown } from "../../../scripts/checks/files.ts";
import { PENDING_CHECKS } from "../../../scripts/checks/seed-checks.ts";
import { SEED_PATHS } from "../../../scripts/checks/seed-files.ts";

// pnpm check:seed itself (05-SEED-DATA §10) on the three-car fixture in tests/fixtures/checks/seed
// and on copies of it: the exit code CI's step blocks on, each problem on stderr, and the pending,
// skipped and pass lines on stdout. The checks themselves are seed-checks.test.ts's.

const FIXTURE = fileURLToPath(new URL("../../fixtures/checks/seed/", import.meta.url));
const folders: string[] = [];

afterAll(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
});

/** A record of seed/cars.json, as far as these tests change it */
type CarRecord = { readonly seedKey: string; readonly car: Record<string, unknown> };

/** A copy of the fixture project, its seed/cars.json holding the records the change gives */
function copyWith(change: (cars: CarRecord[]) => CarRecord[] = (cars) => cars): string {
  const folder = mkdtempSync(path.join(tmpdir(), "muftah-validate-seed-"));
  folders.push(folder);
  cpSync(FIXTURE, folder, { recursive: true });
  const file = path.join(folder, SEED_PATHS.cars);
  writeFileSync(file, JSON.stringify(change(JSON.parse(readFileSync(file, "utf8")) as CarRecord[])));
  return folder;
}

const run = (root: string, ...flags: string[]) =>
  spawnSync(process.execPath, ["scripts/validate-seed.ts", root, ...flags], { encoding: "utf8" });
const lines = (output: string) => output.trim().split("\n");
const pending = PENDING_CHECKS.map((check) => `check:seed: pending (T-18): ${check}`);

describe("pnpm check:seed", () => {
  it("passes the fixture, listing the checks T-18 adds as pending", () => {
    const result = run("tests/fixtures/checks/seed");
    expect(result.stderr).toBe("");
    expect(lines(result.stdout)).toStrictEqual([
      ...pending,
      "check:seed: 3 cars, 7 places and 3 models pass (05-SEED-DATA §10)",
    ]);
    expect(result.status).toBe(0);
  });

  it("fails on a problem a check finds, naming it on stderr", () => {
    const folder = copyWith((cars) =>
      cars.map((record) =>
        record.seedKey === "s01" ? { ...record, car: { ...record.car, mileageKm: 85000 } } : record,
      ),
    );
    const result = run(folder);
    expect(lines(result.stderr)).toStrictEqual([
      "check:seed: seed/cars.json: s01: car.mileageKm: 85000, where scripts/seed-expectations.json has 84000",
    ]);
    expect(lines(result.stdout)).toStrictEqual(pending);
    expect(result.status).toBe(1);
  });

  it("fails on a file it can't read, naming it, and checks nothing then", () => {
    const folder = copyWith();
    rmSync(path.join(folder, SEED_PATHS.places));
    const result = run(folder);
    expect(lines(result.stderr)).toStrictEqual([
      `check:seed: ${shown(path.join(folder, SEED_PATHS.places))} is missing`,
    ]);
    expect(result.stdout).toBe("");
    expect(result.status).toBe(1);
  });

  it("lets a car not written yet wait with --partial only, saying what it left unchecked", () => {
    const folder = copyWith((cars) => cars.filter(({ seedKey }) => seedKey !== "s03"));
    const partial = run(folder, "--partial");
    expect(partial.stderr).toBe("");
    expect(lines(partial.stdout)).toStrictEqual([
      ...pending,
      "check:seed: skipped: check 2: the totals, until every car is written (not yet: s03)",
      "check:seed: skipped: check 5: the VINs of s03, not written yet",
      "check:seed: 2 of 3 cars, 7 places and 3 models pass (05-SEED-DATA §10)",
    ]);
    expect(partial.status).toBe(0);
    const full = run(folder);
    expect(lines(full.stderr)).toStrictEqual([
      "check:seed: scripts/seed-expectations.json: s03: no record in seed/cars.json",
      "check:seed: seed-private/vins.json: s03: no record in seed/cars.json",
    ]);
    expect(full.status).toBe(1);
  });
});
