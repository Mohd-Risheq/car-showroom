import type { ReactNode } from "react";
import { cn } from "@/lib/class-names";
import { ScrollFrame } from "./scroll-frame";

// A table on a reading page, as the privacy page's (DESIGN §7.2.9): a row of column headings, then
// rows that each start with a heading of their own. The text is the small step, each cell starts at
// its top, and rules in --line part the rows (DESIGN §3.5). Wider than a phone's screen, it scrolls
// in a frame of its own (D-041), and the rows' headings hold at its start, so each row keeps its
// name in view as the rest scrolls under it.

type DataTableProps = {
  /** Names the frame for screen readers */
  label: string;
  /** The columns' headings, the first over the rows' own */
  head: readonly string[];
  /** Each row's cells, its heading first, one for each column */
  rows: readonly (readonly ReactNode[])[];
};

const CELL = "py-3 pe-6 text-start align-top last:pe-0";
/** The rows' headings and the heading over them, opaque over the cells that scroll under them */
const HELD = "sticky start-0 w-table-head bg-bg";

export function DataTable({ label, head, rows }: DataTableProps) {
  for (const row of rows) {
    if (row.length !== head.length) {
      throw new RangeError(`A row of "${label}" has ${row.length} cells for ${head.length} columns`);
    }
  }
  return (
    <ScrollFrame label={label} className="mt-6">
      <table className="w-full min-w-table border-separate border-spacing-0 type-small">
        <thead>
          <tr>
            {head.map((heading, column) => (
              <th key={heading} scope="col" className={cn(CELL, "pt-0 font-medium text-meta", column === 0 && HELD)}>
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([heading, ...cells], row) => (
            <tr key={row}>
              <th scope="row" className={cn(CELL, HELD, "border-t border-line font-medium")}>
                {heading}
              </th>
              {cells.map((cell, column) => (
                <td key={column} className={cn(CELL, "border-t border-line")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollFrame>
  );
}
