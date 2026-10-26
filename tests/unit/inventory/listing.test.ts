import { describe, expect, it } from "vitest";
import { isNewArrival, isPublic, priceDrop, soldCutoff } from "@/features/inventory/domain/listing";

// The time rules of the public inventory, which the cached functions compute (SRS §11.4). Days are
// elapsed 24-hour periods, as the fixed-clock cases of BR-12 count them (TC-18-4, TC-35-7).

const NOW = new Date("2026-10-24T09:00:00.000Z");
const MINUTE = 60_000;
const DAY = 86_400_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe("BR-04: which cars the public sees", () => {
  const cutoff = soldCutoff(NOW, 14);

  it("puts the cutoff the sold window's length before now, for SQL and memory alike", () => {
    expect(cutoff).toStrictEqual(ago(14 * DAY));
    expect(soldCutoff(NOW, 0)).toStrictEqual(NOW);
  });

  it("shows published and reserved cars, never drafts or archived ones", () => {
    expect(isPublic({ status: "published", soldAt: null }, cutoff)).toBe(true);
    expect(isPublic({ status: "reserved", soldAt: null }, cutoff)).toBe(true);
    expect(isPublic({ status: "draft", soldAt: null }, cutoff)).toBe(false);
    expect(isPublic({ status: "archived", soldAt: ago(DAY) }, cutoff)).toBe(false);
  });

  it("shows a sold car for sold_visible_days after its sale, and not from that moment on", () => {
    expect(isPublic({ status: "sold", soldAt: ago(14 * DAY - MINUTE) }, cutoff)).toBe(true);
    expect(isPublic({ status: "sold", soldAt: ago(14 * DAY) }, cutoff)).toBe(false);
    expect(isPublic({ status: "sold", soldAt: ago(0) }, soldCutoff(NOW, 0))).toBe(false);
  });

  it("hides a sold car with no sale date, which the database never holds", () => {
    expect(isPublic({ status: "sold", soldAt: null }, cutoff)).toBe(false);
  });
});

describe("BR-05: a price drop", () => {
  const drop = (changedAt: Date) => ({ oldPriceJod: 21_500, newPriceJod: 20_000, changedAt });

  it("notes the old price and the date for 30 days", () => {
    expect(priceDrop(drop(ago(30 * DAY)), NOW)).toStrictEqual({ fromJod: 21_500, on: ago(30 * DAY), badge: false });
    expect(priceDrop(drop(ago(30 * DAY + MINUTE)), NOW)).toBeNull();
  });

  it("badges the card for the first 14 days", () => {
    expect(priceDrop(drop(ago(0)), NOW)?.badge).toBe(true);
    expect(priceDrop(drop(ago(14 * DAY - MINUTE)), NOW)?.badge).toBe(true);
    expect(priceDrop(drop(ago(14 * DAY)), NOW)?.badge).toBe(false);
  });

  it("never shows an increase, so a rise after a drop leaves nothing to show", () => {
    expect(priceDrop({ oldPriceJod: 20_000, newPriceJod: 21_500, changedAt: ago(DAY) }, NOW)).toBeNull();
    expect(priceDrop(null, NOW)).toBeNull();
  });
});

describe("FR-06.7: the New badge", () => {
  it("marks a car published in the last 7 days", () => {
    expect(isNewArrival(ago(7 * DAY), NOW)).toBe(true);
    expect(isNewArrival(ago(7 * DAY + MINUTE), NOW)).toBe(false);
    expect(isNewArrival(null, NOW)).toBe(false);
  });
});
