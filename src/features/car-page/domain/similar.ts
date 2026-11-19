import { inventoryQuery } from "@/features/inventory/domain/inventory-query";
import { pagePath } from "@/features/shell/domain/pages";
import type { BodyType } from "@/lib/db/enums";
import type { AppLocale } from "@/lib/i18n/locales";
import { PRICE_JOD } from "@/lib/validation/bounds";

// Find a similar car (FR-09.9, DESIGN §7.2.11) opens the inventory on the car's body type and, for
// a car whose price is known, on prices within a fifth of it either way, in the inventory's own
// keys (inventory-query.ts). The band runs from four fifths to six fifths of the price, rounded
// outward to whole dinars so it never leaves out a price within a fifth, within a car's prices.

/** The inventory's address for cars like this one */
export function similarCarsPath<L extends AppLocale>(
  locale: L,
  bodyType: BodyType,
  priceJod?: number,
): `/${L}/cars?${string}` {
  const band = priceJod === undefined ? {} : priceBand(priceJod);
  return `${pagePath(locale, "cars")}?${inventoryQuery({ body: bodyType, ...band })}`;
}

/** The prices within a fifth of the price either way */
function priceBand(priceJod: number): { priceMin: number; priceMax: number } {
  return {
    priceMin: Math.max(PRICE_JOD.min, Math.floor((priceJod * 4) / 5)),
    priceMax: Math.min(PRICE_JOD.max, Math.ceil((priceJod * 6) / 5)),
  };
}
