import { describe, expect, it } from "vitest";
import { featureColumns, featuresByGroup } from "@/features/car-page/domain/feature-groups";
import { FEATURE_GROUPS, FEATURE_KEYS, type FeatureKey } from "@/lib/db/feature-keys";

// Region G's rule (DESIGN §7.2.3, FR-09): the car's features under the feature catalog's groups, the
// groups and each group's features in the catalog's order (SRS §6.4), and a group the car has none
// of left out. How the section shows them is features.test.tsx's.

describe("featuresByGroup", () => {
  it("puts the car's features under their groups, in the catalog's order", () => {
    expect(featuresByGroup(["carplay", "alloy_wheels", "abs", "airbags"])).toStrictEqual([
      { group: "interior", keys: ["airbags"] },
      { group: "exterior", keys: ["alloy_wheels"] },
      { group: "technology", keys: ["abs", "carplay"] },
    ]);
  });

  it("gives a car with every feature each of the catalog's groups, whole", () => {
    expect(featuresByGroup(FEATURE_KEYS.toReversed())).toStrictEqual(
      Object.entries(FEATURE_GROUPS).map(([group, keys]) => ({ group, keys })),
    );
  });

  it("leaves out a group the car has none of", () => {
    expect(featuresByGroup(["sunroof"])).toStrictEqual([{ group: "exterior", keys: ["sunroof"] }]);
    expect(featuresByGroup([])).toStrictEqual([]);
  });
});

/** A car's features, as many from each group as given, from the start of its list in the catalog */
const owning = (interior: number, exterior: number, technology: number): FeatureKey[] => [
  ...FEATURE_GROUPS.interior.slice(0, interior),
  ...FEATURE_GROUPS.exterior.slice(0, exterior),
  ...FEATURE_GROUPS.technology.slice(0, technology),
];

/** Each column's groups, by name */
const shape = (interior: number, exterior: number, technology: number) =>
  featureColumns(featuresByGroup(owning(interior, exterior, technology))).map((column) =>
    column.map(({ group }) => group),
  );

describe("featureColumns", () => {
  it("sets two short groups over each other beside a long one, so the columns end level", () => {
    expect(shape(6, 4, 10)).toStrictEqual([["interior", "exterior"], ["technology"]]);
    expect(shape(10, 2, 2)).toStrictEqual([["interior"], ["exterior", "technology"]]);
  });

  it("sets groups of about one length side by side, one a column", () => {
    expect(shape(3, 3, 3)).toStrictEqual([["interior"], ["exterior"], ["technology"]]);
    expect(shape(5, 5, 0)).toStrictEqual([["interior"], ["exterior"]]);
  });

  it("keeps a lone group, and a long group over a short one, in one column", () => {
    expect(shape(0, 0, 12)).toStrictEqual([["technology"]]);
    expect(shape(15, 1, 0)).toStrictEqual([["interior", "exterior"]]);
  });

  it("keeps each group whole and the catalog's order down and across the columns", () => {
    const groups = featuresByGroup(owning(6, 4, 10));
    expect(featureColumns(groups).flat()).toStrictEqual(groups);
    expect(featureColumns([])).toStrictEqual([]);
  });
});
