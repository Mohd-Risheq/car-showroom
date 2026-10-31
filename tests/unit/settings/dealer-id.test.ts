import { cacheLife } from "next/cache";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dealerSlugOf, getDealerId } from "@/features/settings/server/dealer-id";
import { loadDealerId } from "@/features/settings/server/dealer-queries";
import { publicDb } from "@/lib/db/client";

// The dealer this deployment serves, the row DEALER_SLUG names (SRS §15.1): the slug is checked as the
// dealer table checks one, and a deployment without its dealer stops rather than serve a showroom
// with no name

vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ publicDb: { name: "publicDb" } }));
vi.mock("@/features/settings/server/dealer-queries", () => ({ loadDealerId: vi.fn() }));

const DEALER = "01923456-7890-7abc-8def-0000000000d1";

afterEach(() => {
  vi.clearAllMocks();
});

describe("dealerSlugOf", () => {
  it("takes a slug as the dealer table writes one", () => {
    for (const slug of ["muftah", "muftah-motors", "a", "dealer-2", "x".repeat(40)]) {
      expect(dealerSlugOf(slug)).toBe(slug);
    }
  });

  it("stops a deployment that names no dealer", () => {
    for (const value of [undefined, ""]) {
      expect(() => dealerSlugOf(value), String(value)).toThrow(/^DEALER_SLUG isn't set/);
    }
  });

  it("stops a value the dealer table would refuse as a slug", () => {
    for (const value of ["Muftah", "muftah motors", "muftah_motors", " muftah", "مفتاح", "x".repeat(41)]) {
      expect(() => dealerSlugOf(value), value).toThrow(/^DEALER_SLUG must be the dealer's slug/);
    }
  });
});

describe("getDealerId", () => {
  it("reads the dealer DEALER_SLUG names through the public client, cached with the public data", async () => {
    vi.stubEnv("DEALER_SLUG", "muftah");
    vi.mocked(loadDealerId).mockResolvedValue(DEALER);
    expect(await getDealerId()).toBe(DEALER);
    expect(vi.mocked(loadDealerId).mock.calls).toStrictEqual([[publicDb, "muftah"]]);
    expect(vi.mocked(cacheLife).mock.calls).toStrictEqual([["catalog"]]);
  });

  it("stops when no dealer has the slug", async () => {
    vi.stubEnv("DEALER_SLUG", "muftah");
    vi.mocked(loadDealerId).mockResolvedValue(null);
    await expect(getDealerId()).rejects.toThrow(/^No dealer has the slug in DEALER_SLUG/);
  });

  it("checks the slug before it reads anything", async () => {
    vi.stubEnv("DEALER_SLUG", "Muftah");
    await expect(getDealerId()).rejects.toThrow(/^DEALER_SLUG must be the dealer's slug/);
    expect(loadDealerId).not.toHaveBeenCalled();
  });
});
