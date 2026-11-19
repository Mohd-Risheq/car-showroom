import type { BodyType } from "@/lib/db/enums";

// FR-07's filters as the inventory's address carries them, each under its URL key in FR-07's table,
// so a link that opens the inventory filtered, as a car page's Find a similar car does, writes the
// keys the inventory reads. T-24 adds the table's other filters, and the reading of them, here.

/** The filters a link opens the inventory on */
type InventoryFilters = {
  readonly body?: BodyType;
  /** Whole dinars */
  readonly priceMin?: number;
  readonly priceMax?: number;
};

/** The inventory's query for the filters, in FR-07's keys */
export function inventoryQuery({ body, priceMin, priceMax }: InventoryFilters): string {
  const query = new URLSearchParams();
  if (body !== undefined) query.set("body", body);
  if (priceMin !== undefined) query.set("priceMin", String(priceMin));
  if (priceMax !== undefined) query.set("priceMax", String(priceMax));
  return query.toString();
}
