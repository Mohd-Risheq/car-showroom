import { describe, expect, it } from "vitest";
import { relatedCars } from "@/features/car-page/domain/related";
import type { BodyType } from "@/lib/db/enums";
import type { PublicStatus } from "@/lib/db/public-dto";

// FR-09.10's related cars: up to four cars of the same body type whose price is within a quarter of
// this car's either way, newest first as the inventory index lists them, without the car itself or
// a sold car (the owner, 2026-11-03)

const CAR = { id: "this", bodyType: "suv", priceJod: 20_000 } as const;

type Card = { id: string; status: PublicStatus; bodyType: BodyType; priceJod: number };

const card = (id: string, changes: Partial<Card> = {}): Card => ({
  id,
  status: "published",
  bodyType: "suv",
  priceJod: 20_000,
  ...changes,
});

const idsOf = (cards: readonly Card[]) => cards.map(({ id }) => id);

describe("relatedCars", () => {
  it("takes the first four related cars in the index's order, newest first", () => {
    const cards = ["c1", "c2", "c3", "c4", "c5"].map((id) => card(id));
    expect(idsOf(relatedCars(CAR, cards))).toStrictEqual(["c1", "c2", "c3", "c4"]);
  });

  it("keeps a price a quarter below or above, and leaves out one past it", () => {
    const cards = [15_000, 25_000, 14_999, 25_001].map((priceJod) => card(String(priceJod), { priceJod }));
    expect(idsOf(relatedCars(CAR, cards))).toStrictEqual(["15000", "25000"]);
  });

  it("measures the quarter exactly where it falls between whole dinars", () => {
    // A quarter of 19,999 either way is 14,999.25 to 24,998.75
    const cards = [14_999, 15_000, 24_998, 24_999].map((priceJod) => card(String(priceJod), { priceJod }));
    expect(idsOf(relatedCars({ ...CAR, priceJod: 19_999 }, cards))).toStrictEqual(["15000", "24998"]);
  });

  it("leaves out the car itself, another body type and a sold car, and keeps a reserved one", () => {
    const cards = [card("this"), card("sedan", { bodyType: "sedan" }), card("sold", { status: "sold" })];
    expect(idsOf(relatedCars(CAR, [...cards, card("reserved", { status: "reserved" })]))).toStrictEqual(["reserved"]);
  });

  it("is none where no other car is related", () => {
    expect(relatedCars(CAR, [card("this")])).toStrictEqual([]);
  });
});
