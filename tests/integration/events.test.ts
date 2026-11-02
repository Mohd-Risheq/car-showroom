import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createEventsHandler } from "@/features/analytics/server/ingest";
import { getPublicCarIds } from "@/features/inventory/server/inventory-index";
import { getDealerId } from "@/features/settings/server/dealer-id";
import { NO_CAR } from "@/lib/analytics/events";
import { type Database, httpDatabase } from "@/lib/db/client";
import { eventDaily, rateLimit } from "@/lib/db/schema";
import { rateLimitKey } from "@/lib/rate-limit/key";
import { createThrowawayDatabase, type ThrowawayDatabase } from "../support/throwaway-database";

// API-03 on Postgres (TC-47-1, TC-47-2, TC-47-4): the handler counts in ENT-EventDaily and limits in
// ENT-RateLimit, on a database of this file's own, as its counts and the limit's purge would meet
// other files' rows. The dealer's id and the cached list of its cars are stood in for, as Next.js's
// cache runs only in a build; their reads have their own tests.

const live = vi.hoisted(() => ({ db: undefined as unknown }));

vi.mock("@/lib/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/client")>();
  return {
    ...actual,
    get db() {
      return live.db;
    },
  };
});
vi.mock("@/features/settings/server/dealer-id", () => ({ getDealerId: vi.fn() }));
vi.mock("@/features/inventory/server/inventory-index", () => ({ getPublicCarIds: vi.fn() }));

const ORIGIN = "http://localhost:3000";
const SECRET = "integration-test-secret-not-a-real-one-0123";
const DEALER = "01923456-7890-7abc-8def-0000000000d1";
const CAR = "01923456-7890-7abc-8def-00000000000a";
const OTHER_CAR = "01923456-7890-7abc-8def-00000000000b";
const ADDRESS = "203.0.113.7";
const BROWSER =
  "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
// SRS §16's test clock, noon in Amman
const NOW = new Date("2026-10-18T09:00:00.000Z");
const VIEW = { e: "car_view", c: CAR, l: "ar" };

let database: ThrowawayDatabase | undefined;
let db: Database;

beforeAll(async () => {
  database = await createThrowawayDatabase("t20_events");
  db = httpDatabase(database.url);
  live.db = db;
});

afterAll(async () => {
  await database?.drop();
});

beforeEach(async () => {
  vi.stubEnv("RATE_LIMIT_HMAC_SECRET", SECRET);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);
  vi.mocked(getDealerId).mockResolvedValue(DEALER);
  vi.mocked(getPublicCarIds).mockResolvedValue(new Set([CAR, OTHER_CAR]));
  await db.delete(eventDaily);
  await db.delete(rateLimit);
});

/** A handler, as one instance has, whose work after the response settled() waits for */
function instance(now = () => NOW) {
  const tasks: Promise<void>[] = [];
  const POST = createEventsHandler({ now, schedule: (task) => void tasks.push(task()) });
  return { POST, settled: () => Promise.all(tasks) };
}

function beacon(body: unknown, address = ADDRESS): Request {
  return new Request(`${ORIGIN}/api/events`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "text/plain;charset=UTF-8",
      "sec-fetch-site": "same-origin",
      "user-agent": BROWSER,
      "x-real-ip": address,
    },
  });
}

/** Sends an event a number of times, one after another, each counted before the next is sent */
async function send({ POST, settled }: ReturnType<typeof instance>, times: number, address = ADDRESS) {
  for (let i = 0; i < times; i += 1) {
    await POST(beacon(VIEW, address));
    await settled();
  }
}

const counts = () =>
  db
    .select({
      day: eventDaily.day,
      event: eventDaily.event,
      carId: eventDaily.carId,
      locale: eventDaily.locale,
      count: eventDaily.count,
    })
    .from(eventDaily)
    .orderBy(eventDaily.day, eventDaily.event, eventDaily.carId, eventDaily.locale);

const counted = async () => (await counts()).reduce((sum, row) => sum + row.count, 0);

describe("POST /api/events on Postgres", () => {
  it.each([
    ["an event not on the list (TC-47-1)", { e: "page_admin", l: "ar" }],
    ["an event with a key the schema doesn't take", { ...VIEW, ip: ADDRESS }],
    ["a car the site doesn't show", { ...VIEW, c: "01923456-7890-7abc-8def-00000000000c" }],
  ])("answers 204 and writes nothing for %s", async (_, body) => {
    const { POST, settled } = instance();
    const response = await POST(beacon(body));
    await settled();
    expect(response.status).toBe(204);
    expect(await counts()).toStrictEqual([]);
    expect(await db.select().from(rateLimit)).toStrictEqual([]);
  });

  it("adds each event to its day's row for the event, the car and the locale (TC-47-2)", async () => {
    const { POST, settled } = instance();
    for (const body of [
      VIEW,
      VIEW,
      { ...VIEW, l: "en" },
      { ...VIEW, c: OTHER_CAR },
      { e: "contact_whatsapp", c: CAR, l: "ar" },
      { e: "page_home", l: "ar" },
      { e: "page_home", l: "ar" },
      { e: "client_error", l: "en", r: "/[locale]/cars/[slug]", x: "CHUNK_GSAP" },
    ]) {
      await POST(beacon(body));
    }
    await settled();
    expect(await counts()).toStrictEqual([
      { day: "2026-10-18", event: "page_home", carId: NO_CAR, locale: "ar", count: 2 },
      { day: "2026-10-18", event: "car_view", carId: CAR, locale: "ar", count: 2 },
      { day: "2026-10-18", event: "car_view", carId: CAR, locale: "en", count: 1 },
      { day: "2026-10-18", event: "car_view", carId: OTHER_CAR, locale: "ar", count: 1 },
      { day: "2026-10-18", event: "contact_whatsapp", carId: CAR, locale: "ar", count: 1 },
      { day: "2026-10-18", event: "client_error", carId: NO_CAR, locale: "en", count: 1 },
    ]);
  });

  it("counts each of the events that arrive at the same moment", async () => {
    const { POST, settled } = instance();
    await Promise.all(Array.from({ length: 20 }, () => POST(beacon(VIEW))));
    await settled();
    expect(await counts()).toStrictEqual([
      { day: "2026-10-18", event: "car_view", carId: CAR, locale: "ar", count: 20 },
    ]);
  });

  // Jordan keeps UTC+3 all year, so Amman's day starts at 21:00 UTC (BR-03)
  it("counts an event in the day it falls on in Amman", async () => {
    let clock = new Date("2026-10-17T20:59:59.999Z");
    const handler = instance(() => clock);
    await send(handler, 1);
    clock = new Date("2026-10-17T21:00:00.000Z");
    await send(handler, 1);
    expect((await counts()).map(({ day, count }) => ({ day, count }))).toStrictEqual([
      { day: "2026-10-17", count: 1 },
      { day: "2026-10-18", count: 1 },
    ]);
  });

  it("keeps no address, user agent or text: the tables have their columns and no others (TC-47-2)", async () => {
    await send(instance(), 1);
    const { rows } = await db.execute<{ table_name: string; column_name: string }>(sql`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public' and table_name in ('event_daily', 'rate_limit')
      order by table_name, ordinal_position
    `);
    expect(rows.map((row) => `${row.table_name}.${row.column_name}`)).toStrictEqual([
      ...["event_daily.day", "event_daily.event", "event_daily.car_id", "event_daily.locale", "event_daily.count"],
      ...["rate_limit.key", "rate_limit.window_start", "rate_limit.count", "rate_limit.blocked_until"],
    ]);
    // FR-47.4: the limit keeps the HMAC of the route and the network, never the address
    expect(await db.select({ key: rateLimit.key }).from(rateLimit)).toStrictEqual([
      { key: rateLimitKey(SECRET, { scope: "network", route: "API-03", subject: ADDRESS }, NOW) },
    ]);
  });
});

describe("API-03's limit, 60 events a minute from a network (TC-47-4)", () => {
  it("counts 60 events in a minute from one address and drops the rest, but not another's", async () => {
    const handler = instance();
    await send(handler, 61);
    expect(await counted()).toBe(60);
    await send(handler, 1, "198.51.100.20");
    expect(await counted()).toBe(61);
  });

  it("counts an address's events again once its minute has passed", async () => {
    let clock = NOW;
    const handler = instance(() => clock);
    await send(handler, 61);
    clock = new Date(NOW.getTime() + 60_000);
    await send(handler, 1);
    expect(await counted()).toBe(61);
  });

  // Each instance's memory sees fewer than 60, and the database every instance's
  it("holds across instances, through the database", async () => {
    await send(instance(), 40);
    await send(instance(), 21);
    expect(await counted()).toBe(60);
  });

  // SEC-12: an IPv6 address counts with the others in its /64
  it("counts an IPv6 network's addresses together", async () => {
    const handler = instance();
    await send(handler, 60, "2001:db8:1:2::1");
    await send(handler, 1, "2001:db8:1:2:ffff:ffff:ffff:ffff");
    expect(await counted()).toBe(60);
    await send(handler, 1, "2001:db8:1:3::1");
    expect(await counted()).toBe(61);
  });
});
