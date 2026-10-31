import { describe, expect, it } from "vitest";
import { GARAGE_MAX, storedCount } from "@/features/garage/domain/stored-count";

// BR-36: the header's Garage key counts the cars My Garage keeps in local storage, an array of saved
// cars each named by its carId, at most 30, and shows no count for what it can't read (FR-02)

const saved = (count: number) =>
  JSON.stringify(Array.from({ length: count }, (_, index) => ({ carId: `car-${index}` })));

describe("storedCount", () => {
  it("is 0 when nothing is stored", () => {
    expect(storedCount(null)).toBe(0);
    expect(storedCount("[]")).toBe(0);
  });

  it("counts the saved cars", () => {
    expect(storedCount(saved(1))).toBe(1);
    expect(storedCount(saved(12))).toBe(12);
  });

  it("counts at most BR-36's 30", () => {
    expect(GARAGE_MAX).toBe(30);
    expect(storedCount(saved(30))).toBe(30);
    expect(storedCount(saved(31))).toBe(30);
  });

  it("counts only entries that name a car", () => {
    const stored = JSON.stringify([{ carId: "a" }, { carId: 7 }, { id: "b" }, null, "c", [], { carId: "d", at: 1 }]);
    expect(storedCount(stored)).toBe(2);
  });

  it("shows no count for what isn't a garage", () => {
    for (const stored of ["", "not json", "{", "null", "3", '"cars"', '{"carId":"a"}']) {
      expect(storedCount(stored), stored).toBeNull();
    }
  });
});
