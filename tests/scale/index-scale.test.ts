import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { soldCutoff } from "@/features/inventory/domain/listing";
import { buildIndex } from "@/features/inventory/server/build-index";
import { decodeIndex, encodeIndex } from "@/features/inventory/server/index-codec";
import { loadIndexRows } from "@/features/inventory/server/index-queries";
import { publicDatabase } from "@/lib/db/client";
import { uuidv7 } from "@/lib/db/id";
import { type PublicRepo, publicRepo } from "@/lib/db/scoped-repo";
import { SOLD_VISIBLE_DAYS } from "@/lib/validation/bounds";
import { publicCarIds, scaleFixture } from "../support/scale-fixture";
import { createThrowawayDatabase, type ThrowawayDatabase } from "../support/throwaway-database";

// NFR-SCALE-02 at NFR-SCALE-01's scale: getInventoryIndex's cached work (one batch, the builder and
// the wire, as loadIndexWire runs them) for 1,000 public cars, beside the rows the public reads
// skip, takes one round trip each time and at most 300 ms at p95. The time runs through the app's
// public client and the local proxy, whose own cost is in it (D-043). Filtering, sorting and
// faceting the index in memory are T-24's half of the requirement.

const WARM_UPS = 5;
const RUNS = 30;

const dealerId = uuidv7();
// SRS §16.1's fixed clock, which the fixture sets every date from
const now = new Date("2026-10-18T12:00:00+03:00");
let throwaway: ThrowawayDatabase | undefined;
let repo: PublicRepo;

beforeAll(async () => {
  throwaway = await createThrowawayDatabase("t16_index_scale");
  const client = postgres(throwaway.directUrl, { max: 1, onnotice: () => {} });
  try {
    for (const { text, params } of scaleFixture(dealerId, now)) await client.unsafe(text, [...params]);
    await client.unsafe("analyze");
  } finally {
    await client.end();
  }
  repo = publicRepo(dealerId, publicDatabase(throwaway.url));
});

afterAll(async () => {
  await throwaway?.drop();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const indexWire = async () =>
  encodeIndex(buildIndex(await loadIndexRows(repo, soldCutoff(now, SOLD_VISIBLE_DAYS.max)), now));

describe("the inventory index at 1,000 public cars", () => {
  it("holds every public car and nothing else", async () => {
    const { cards } = decodeIndex(await indexWire());
    expect(cards.map((card) => card.id).toSorted()).toStrictEqual(publicCarIds().toSorted());
  });

  it("is built in one round trip each time, in at most 300 ms at p95 (NFR-SCALE-02)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const times: number[] = [];
    for (let run = 0; run < WARM_UPS + RUNS; run += 1) {
      fetchSpy.mockClear();
      const started = performance.now();
      await indexWire();
      const elapsed = performance.now() - started;
      expect(fetchSpy).toHaveBeenCalledOnce();
      if (run >= WARM_UPS) times.push(elapsed);
    }
    const sorted = times.toSorted((a, b) => a - b);
    expect(sorted[Math.ceil(0.95 * RUNS) - 1]).toBeLessThanOrEqual(300);
  });
});
