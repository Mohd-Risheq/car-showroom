import { describe, expect, it } from "vitest";
import { similarCarsPath } from "@/features/car-page/domain/similar";

// Find a similar car (FR-09.9, DESIGN §7.2.11): the inventory on the car's body type, and for a car
// whose price is known, on prices within a fifth of it either way (FR-07's body, priceMin, priceMax)

describe("similarCarsPath", () => {
  it("opens the inventory on the body type of a car that has gone", () => {
    expect(similarCarsPath("en", "suv")).toBe("/en/cars?body=suv");
    expect(similarCarsPath("ar", "pickup")).toBe("/ar/cars?body=pickup");
  });

  it("adds a fifth of a sold car's price either way, as the spec's seed examples give", () => {
    expect(similarCarsPath("ar", "sedan", 22_500)).toBe("/ar/cars?body=sedan&priceMin=18000&priceMax=27000");
    expect(similarCarsPath("en", "hatchback", 11_800)).toBe("/en/cars?body=hatchback&priceMin=9440&priceMax=14160");
  });

  it("rounds the band outward to whole dinars, so it never leaves out a price within a fifth", () => {
    // 0.8 and 1.2 times 12,345 are 9,876 and 14,814
    expect(similarCarsPath("en", "sedan", 12_345)).toBe("/en/cars?body=sedan&priceMin=9876&priceMax=14814");
    // 0.8 and 1.2 times 12,346 are 9,876.8 and 14,815.2
    expect(similarCarsPath("en", "sedan", 12_346)).toBe("/en/cars?body=sedan&priceMin=9876&priceMax=14816");
  });

  it("keeps the band within the prices a car can have", () => {
    expect(similarCarsPath("en", "coupe", 300)).toBe("/en/cars?body=coupe&priceMin=300&priceMax=360");
    expect(similarCarsPath("en", "coupe", 1_000_000)).toBe("/en/cars?body=coupe&priceMin=800000&priceMax=1000000");
  });
});
