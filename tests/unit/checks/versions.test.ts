import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FLOORS, floorReport, lockfilePackages, meetsFloor } from "../../../scripts/checks/versions.ts";

// SEC-11's version floor, then scripts/check-versions.ts on the clean and planted lockfiles in
// tests/fixtures/checks/versions (TC-NFR-10 plants an older next). They aren't named pnpm-lock.yaml,
// so dependency scanners never take the planted versions for real ones.

const FIXTURES = "tests/fixtures/checks/versions";

function packagesOf(folder: "clean" | "planted") {
  const packages = lockfilePackages(readFileSync(`${FIXTURES}/${folder}-lockfile.yaml`, "utf8"));
  if (typeof packages === "string") throw new Error(packages);
  return packages;
}

describe("lockfilePackages", () => {
  it("reads every package version from the packages section, scoped names too, and not the snapshots", () => {
    expect(Object.fromEntries(packagesOf("clean"))).toStrictEqual({
      "@img/sharp-darwin-arm64": ["0.35.5"],
      next: ["16.4.2"],
      "react-dom": ["19.3.1"],
      react: ["19.3.1"],
      sharp: ["0.35.5"],
    });
    expect(packagesOf("planted").get("react")).toStrictEqual(["18.3.1", "19.3.1"]);
  });

  it("reads only a version 9 lockfile with a packages section", () => {
    expect(lockfilePackages("lockfileVersion: '6.0'\n\npackages:\n\n  next@16.4.2:\n")).toBe(
      "not a version 9 pnpm lockfile, the kind this check reads",
    );
    expect(lockfilePackages("lockfileVersion: '9.0'\n\nimporters:\n")).toBe("has no packages section");
  });
});

describe("meetsFloor", () => {
  it("compares each part of the version as a number", () => {
    expect(meetsFloor("16.4.1", "16.4.1")).toBe(true);
    expect(meetsFloor("16.4.10", "16.4.9")).toBe(true);
    expect(meetsFloor("16.10.0", "16.4.1")).toBe(true);
    expect(meetsFloor("17.0.0", "16.4.1")).toBe(true);
    expect(meetsFloor("16.4.0", "16.4.1")).toBe(false);
    expect(meetsFloor("16.3.9", "16.4.1")).toBe(false);
    expect(meetsFloor("15.9.9", "16.4.1")).toBe(false);
  });

  it("puts a prerelease of the floor's own release below it, and a later one's above", () => {
    expect(meetsFloor("16.4.1-canary.3", "16.4.1")).toBe(false);
    expect(meetsFloor("16.5.0-canary.1", "16.4.1")).toBe(true);
    expect(meetsFloor("16.4.1+build.5", "16.4.1")).toBe(true);
  });

  it("can't compare what isn't a version", () => {
    for (const version of ["16.4", "link:../next", "https://codeload.github.com/vercel/next.js/tar.gz/abc"]) {
      expect(meetsFloor(version, "16.4.1"), version).toBeUndefined();
    }
  });
});

describe("floorReport", () => {
  it("holds next, react, react-dom and sharp to SEC-11's floors", () => {
    expect(FLOORS.map(({ name, min, optional }) => ({ name, min, optional }))).toStrictEqual([
      { name: "next", min: "16.4.1", optional: undefined },
      { name: "react", min: "19.3.1", optional: undefined },
      { name: "react-dom", min: "19.3.1", optional: undefined },
      { name: "sharp", min: "0.35.5", optional: true },
    ]);
  });

  it("names every copy below a floor, a missing package, and leaves out sharp when it isn't installed", () => {
    const report = floorReport(new Map([["next", ["16.4.2", "link:../next"]]]));
    expect(report.installed).toStrictEqual(["next 16.4.2", "next link:../next"]);
    expect(report.problems).toStrictEqual([
      "next@link:../next is not a version this check can compare with 16.4.1",
      "react is not in the lockfile, so its SEC-11 floor of 19.3.1 can't be checked",
      "react-dom is not in the lockfile, so its SEC-11 floor of 19.3.1 can't be checked",
    ]);
  });
});

describe("scripts/check-versions.ts", () => {
  const run = (folder: string) =>
    spawnSync(process.execPath, ["scripts/check-versions.ts", `${FIXTURES}/${folder}-lockfile.yaml`], {
      encoding: "utf8",
    });

  it("fails on the planted versions, naming each package, version, floor and advisory", () => {
    const result = run("planted");
    expect(result.status).toBe(1);
    expect(result.stderr.trim().split("\n")).toStrictEqual(
      [
        "next 16.4.0 is below its SEC-11 floor of 16.4.1 (GHSA-673q-mjm6-r5xr, GHSA-2464-fhr4-w9xw and GHSA-p3m5-59mp-jv5r)",
        "react 18.3.1 is below its SEC-11 floor of 19.3.1 (GHSA-xqc2-xf4c-x3h3 and GHSA-h3gv-c5rc-p453)",
        "react-dom is not in the lockfile, so its SEC-11 floor of 19.3.1 can't be checked",
        "sharp 0.35.5-rc.1 is below its SEC-11 floor of 0.35.5 (CVE-2026-96889 and GHSA-2464-fhr4-w9xw)",
      ].map((problem) => `${FIXTURES}/planted-lockfile.yaml: ${problem}`),
    );
  });

  it("passes the clean lockfile", () => {
    const result = run("clean");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      "check-versions: next 16.4.2, react 19.3.1, react-dom 19.3.1, sharp 0.35.5 meet SEC-11's floors\n",
    );
  });

  it("names a missing lockfile", () => {
    const result = run("missing");
    expect(result.status).toBe(1);
    expect(result.stderr).toBe(`${FIXTURES}/missing-lockfile.yaml is missing\n`);
  });
});
