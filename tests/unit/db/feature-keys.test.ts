import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FEATURE_GROUPS, FEATURE_KEYS } from "@/lib/db/feature-keys";

// The feature catalog of SRS §6.4: the keys car.features holds (VR-08), in the wizard's three
// checklists (FR-31 step 3)

const SRS = new URL("../../../docs/02-SRS.md", import.meta.url);

describe("the feature keys", () => {
  it("are the three groups' keys, in order, each once", () => {
    expect(FEATURE_KEYS).toStrictEqual([
      ...FEATURE_GROUPS.interior,
      ...FEATURE_GROUPS.exterior,
      ...FEATURE_GROUPS.technology,
    ]);
    expect(new Set(FEATURE_KEYS).size).toBe(51);
  });

  it("fit car.features' varchar(40) and its key form", () => {
    expect(FEATURE_KEYS.filter((key) => !/^[a-z0-9_]{1,40}$/.test(key))).toStrictEqual([]);
  });

  // The specification is private, so only the private repository can compare (D-035)
  it.skipIf(!existsSync(SRS))("are SRS §6.4's catalog", () => {
    const srs = readFileSync(SRS, "utf8");
    const catalog = srs.slice(srs.indexOf("- **Feature catalog**"), srs.indexOf("- **Seed cars:**"));
    const group = (name: string) => {
      const line = catalog.split("\n").find((row) => row.trimStart().startsWith(`- **${name}:**`)) ?? "";
      return [...line.matchAll(/`([a-z0-9_]+)`/g)].map((match) => match[1]);
    };
    expect({
      interior: group("Interior"),
      exterior: group("Exterior"),
      technology: group("Technology"),
    }).toStrictEqual({
      interior: [...FEATURE_GROUPS.interior],
      exterior: [...FEATURE_GROUPS.exterior],
      technology: [...FEATURE_GROUPS.technology],
    });
  });
});
