import { FEATURE_GROUPS, type FeatureKey } from "@/lib/db/feature-keys";

// Region G's rule (DESIGN §7.2.3, FR-09): the car's features under the feature catalog's groups,
// Interior, Exterior and Technology, the groups and each group's features in the catalog's order
// (SRS §6.4), and the columns the groups stand in from 768 px. A group the car has none of is left
// out. Pure, so the section renders what it gives.

/** A group of the feature catalog's */
export type FeatureGroup = keyof typeof FEATURE_GROUPS;

/** A group the car has features in, and those features */
type GroupFeatures = { readonly group: FeatureGroup; readonly keys: readonly FeatureKey[] };

// Every group, in the catalog's order: Object.keys gives a literal's keys as strings
const GROUPS = Object.keys(FEATURE_GROUPS) as FeatureGroup[];

/** The car's features under each group it has any in, in the catalog's order */
export function featuresByGroup(features: readonly FeatureKey[]): GroupFeatures[] {
  const owned = new Set(features);
  return GROUPS.flatMap((group) => {
    const keys = FEATURE_GROUPS[group].filter((key: FeatureKey) => owned.has(key));
    return keys.length === 0 ? [] : [{ group, keys }];
  });
}

/** A column of the groups from 768 px: whole groups, in the catalog's order */
export type FeatureColumn = readonly GroupFeatures[];

/** A column's height in lines: each group's heading and features, and a line between two groups */
const linesOf = (column: FeatureColumn) =>
  column.reduce((lines, { keys }) => lines + 1 + keys.length, column.length - 1);

/**
 * The groups in columns from 768 px (DESIGN §7.2.3): whole, in the catalog's order down and across,
 * in the columns that cost the least, the tallest column's height and the room left under the
 * shorter ones, so the columns end as nearly level as whole groups allow, and of two that cost the
 * same, the more columns. Interior's 6 features over Exterior's 4 stand beside Technology's 10, and
 * three groups of 3 stand side by side.
 */
export function featureColumns(groups: readonly GroupFeatures[]): FeatureColumn[] {
  let best: { columns: FeatureColumn[]; cost: number } | null = null;
  for (const columns of splitsOf(groups)) {
    const heights = columns.map(linesOf);
    const tallest = Math.max(...heights);
    const cost = heights.reduce((sum, height) => sum + tallest - height, tallest);
    if (best === null || cost < best.cost || (cost === best.cost && columns.length > best.columns.length)) {
      best = { columns, cost };
    }
  }
  return best?.columns ?? [];
}

/** Every way to cut the groups, kept in order, into columns: each cut after a group or not */
function splitsOf(groups: readonly GroupFeatures[]): FeatureColumn[][] {
  if (groups.length === 0) return [];
  return Array.from({ length: 2 ** (groups.length - 1) }, (_, cuts) => {
    const columns: GroupFeatures[][] = [];
    groups.forEach((group, place) => {
      const opens = place === 0 || (cuts & (1 << (place - 1))) !== 0;
      if (opens) columns.push([group]);
      else columns.at(-1)?.push(group);
    });
    return columns;
  });
}
