import type { PublicCardDTO, PublicCarDTO } from "@/lib/db/public-dto";

// FR-09.10's related cars, which DESIGN §7.2.3's Region I draws as cards with T-24's CarCard: up to
// four cars of the car's body type whose price is within a quarter of its own either way, in the
// inventory index's order, newest first. The car itself is left out, and so is a sold car, which
// the index keeps through its window (the owner, 2026-11-03).

/** The most related cars a page shows */
const RELATED = 4;

type Related = Pick<PublicCardDTO, "id" | "status" | "bodyType" | "priceJod">;

/** The index's cars related to this one */
export function relatedCars<C extends Related>(
  car: Pick<PublicCarDTO, "id" | "bodyType" | "priceJod">,
  cards: readonly C[],
): C[] {
  // A quarter either way, in whole numbers: 3/4 of the price to 5/4 of it
  const near = ({ priceJod }: C) => 4 * priceJod >= 3 * car.priceJod && 4 * priceJod <= 5 * car.priceJod;
  return cards
    .filter((card) => card.id !== car.id && card.status !== "sold" && card.bodyType === car.bodyType && near(card))
    .slice(0, RELATED);
}
