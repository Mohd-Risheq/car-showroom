import { expect, it } from "vitest";
import { carsTag, carTag, dealerTag } from "@/lib/db/cache-tags";

// SRS §11.4's tags, which the cached functions set and the actions of §8.1 update

it("names the dealer's cars, one car, and everything public of the dealer", () => {
  const dealerId = "01923456-7890-7abc-8def-0123456789ab";
  const carId = "01923456-7890-7abc-8def-ba9876543210";
  expect([carsTag(dealerId), carTag(carId), dealerTag(dealerId)]).toStrictEqual([
    `cars:${dealerId}`,
    `car:${carId}`,
    `dealer:${dealerId}`,
  ]);
});
