import { describe, expect, it } from "vitest";
import { priceStaleness } from "@/features/cost/domain/staleness";

// BR-12: Jordan sets fuel prices monthly, so prices last set over 35 days ago remind the dealer,
// and over 45 days ago Cost to Run says so in public

const NOW = new Date("2026-10-24T09:00:00.000Z");
const MINUTE = 60_000;
const DAY = 86_400_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe("fuel prices' staleness", () => {
  it("TC-35-7: reminds the dealer once the prices are more than 35 days old", () => {
    expect(priceStaleness(ago(35 * DAY), NOW)).toStrictEqual({ reminder: false, publicNote: false });
    expect(priceStaleness(ago(35 * DAY + MINUTE), NOW)).toStrictEqual({ reminder: true, publicNote: false });
  });

  it("TC-18-4: adds the public note once they are more than 45 days old", () => {
    expect(priceStaleness(ago(45 * DAY), NOW)).toStrictEqual({ reminder: true, publicNote: false });
    expect(priceStaleness(ago(45 * DAY + MINUTE), NOW)).toStrictEqual({ reminder: true, publicNote: true });
  });

  it("TC-18-4, TC-35-7: counts prices that were never set as stale on both counts", () => {
    expect(priceStaleness(null, NOW)).toStrictEqual({ reminder: true, publicNote: true });
  });
});
