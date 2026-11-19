import { cn } from "@/lib/class-names";
import { FEATURE_LABELS } from "@/lib/db/feature-labels";
import { featureColumns, featuresByGroup } from "../domain/feature-groups";
import type { SectionProps } from "./sections";

// Region G (DESIGN §7.2.3, FR-09): the car's features under their groups, Interior, Exterior and
// Technology, in the feature catalog's order (feature-groups.ts). A group's name heads its list at
// the lead step, in weight 500. On a phone the groups stack, each list in two columns from 360 px;
// from 768 px they stand whole in the columns that end most nearly level (featureColumns), each
// list in one, or in three where one column holds them all. A list's columns flow down, not across,
// so a feature that wraps moves only its own column.

/** The groups' grid from 768 px, a track a column */
const GRID = { 1: "md:grid-cols-1", 2: "md:grid-cols-2", 3: "md:grid-cols-3" } as const;

export function CarFeatures({ car, locale, t }: SectionProps) {
  const columns = featureColumns(featuresByGroup(car.features));
  const lone = columns.length === 1;
  return (
    <div className={cn("grid gap-8 md:gap-gutter", GRID[columns.length as keyof typeof GRID])}>
      {columns.map((column) => (
        <div key={column[0]?.group} className="flex flex-col gap-8">
          {column.map(({ group, keys }) => (
            <div key={group}>
              <h3 className="type-lead font-medium">{t(`car.features.${group}`)}</h3>
              <ul
                className={cn(
                  "mt-3 gap-x-4 space-y-2 type-body sm:columns-2",
                  lone ? "md:columns-3 md:gap-x-gutter" : "md:columns-1",
                )}
              >
                {keys.map((key) => (
                  <li key={key} className="break-inside-avoid">
                    {FEATURE_LABELS[key][locale]}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
