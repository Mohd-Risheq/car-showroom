import { describe, expect, it } from "vitest";
import { inventoryQuery } from "@/features/inventory/domain/inventory-query";

// FR-07's filters as the inventory's address carries them, under the table's URL keys, which a link
// that opens the inventory filtered writes and T-24's inventory reads

describe("inventoryQuery", () => {
  it("writes each filter under its FR-07 key", () => {
    expect(inventoryQuery({ body: "suv", priceMin: 38_800, priceMax: 58_200 })).toBe(
      "body=suv&priceMin=38800&priceMax=58200",
    );
  });

  it("leaves out a filter it isn't given", () => {
    expect(inventoryQuery({ body: "pickup" })).toBe("body=pickup");
    expect(inventoryQuery({ priceMax: 20_000 })).toBe("priceMax=20000");
    expect(inventoryQuery({})).toBe("");
  });
});
