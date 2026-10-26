import { cacheLife, cacheTag } from "next/cache";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CarPageRows } from "@/features/car-page/server/build-car";
import { getCarPage } from "@/features/car-page/server/car-page";
import { loadCarPageRows } from "@/features/car-page/server/car-queries";
import { publicDb } from "@/lib/db/client";

// getCarPage (SRS §11.4): the catalog profile, the read-only client, the dealer's rules applied at
// the time it runs, and the tags its result calls for, set as it fills

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ publicDb: { name: "publicDb" } }));
vi.mock("@/features/car-page/server/car-queries", () => ({ loadCarPageRows: vi.fn() }));

const DEALER = "01923456-7890-7abc-8def-0000000000d1";
const CAR = "01923456-7890-7abc-8def-0000000000c1";
const NOW = new Date("2026-10-24T09:00:00.000Z");
const DAY = 86_400_000;
const RULES = {
  soldVisibleDays: 14,
  mileageBands: { low: 12_000, high: 25_000 },
  micronBands: { factoryMax: 180, refinishMax: 300 },
};
const NONE: CarPageRows = {
  rules: [RULES],
  car: [],
  history: [],
  media: [],
  inspection: [],
  price: [],
  journey: [],
  spin: [],
};
// An earlier slug's car, sold on the dealer's 14-day edge at the faked clock. The edge is exact, so
// only the clock read as the function runs gives both results below; one read earlier or later,
// even at module load, fails one of them (BR-04)
const soldAt = (time: number) =>
  [
    {
      id: CAR,
      slug: "2021-toyota-land-cruiser-mu-7k3p",
      status: "sold",
      bodyType: "suv",
      publishedAt: new Date("2026-08-01T08:00:00.000Z"),
      soldAt: new Date(time),
    },
  ] as const;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("getCarPage", () => {
  it("reads the dealer's slug through the public repository, and tags a miss with the inventory", async () => {
    vi.mocked(loadCarPageRows).mockResolvedValue(NONE);
    expect(await getCarPage(DEALER, "no-such-car-mu-2222")).toStrictEqual({ kind: "notFound", gone: null });
    const [repo, slug] = vi.mocked(loadCarPageRows).mock.calls[0] ?? [];
    expect([repo?.dealerId, slug]).toStrictEqual([DEALER, "no-such-car-mu-2222"]);
    expect(repo?.db).toBe(publicDb);
    expect(vi.mocked(cacheLife).mock.calls).toStrictEqual([["catalog"]]);
    expect(vi.mocked(cacheTag).mock.calls).toStrictEqual([[`cars:${DEALER}`, `dealer:${DEALER}`]]);
  });

  it("tags an earlier slug's redirect with its car", async () => {
    const earlier = {
      id: CAR,
      slug: "2021-toyota-land-cruiser-mu-7k3p",
      status: "published",
      bodyType: "suv",
    } as const;
    const history = [{ ...earlier, publishedAt: new Date("2026-10-20T08:00:00.000Z"), soldAt: null }];
    vi.mocked(loadCarPageRows).mockResolvedValue({ ...NONE, history });
    expect(await getCarPage(DEALER, "2021-toyota-land-cruiser-gxr-mu-7k3p")).toStrictEqual({
      kind: "redirect",
      slug: "2021-toyota-land-cruiser-mu-7k3p",
    });
    expect(vi.mocked(cacheTag).mock.calls).toStrictEqual([[`car:${CAR}`, `dealer:${DEALER}`]]);
  });

  it("applies the dealer's window at the time it runs, and tags a gone car with its car", async () => {
    vi.useFakeTimers({ now: NOW });
    vi.mocked(loadCarPageRows).mockResolvedValue({ ...NONE, history: soldAt(NOW.getTime() - 14 * DAY) });
    expect(await getCarPage(DEALER, "2021-toyota-land-cruiser-gxr-mu-7k3p")).toStrictEqual({
      kind: "notFound",
      gone: { bodyType: "suv" },
    });
    expect(vi.mocked(cacheTag).mock.calls).toStrictEqual([[`car:${CAR}`, `dealer:${DEALER}`]]);
  });

  it("still shows a sale a millisecond younger at that time", async () => {
    vi.useFakeTimers({ now: NOW });
    vi.mocked(loadCarPageRows).mockResolvedValue({ ...NONE, history: soldAt(NOW.getTime() - 14 * DAY + 1) });
    expect(await getCarPage(DEALER, "2021-toyota-land-cruiser-gxr-mu-7k3p")).toStrictEqual({
      kind: "redirect",
      slug: "2021-toyota-land-cruiser-mu-7k3p",
    });
  });
});
