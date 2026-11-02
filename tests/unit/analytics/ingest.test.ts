import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEventsHandler, type EventsHandlerOptions } from "@/features/analytics/server/ingest";
import { getPublicCarIds } from "@/features/inventory/server/inventory-index";
import { getDealerId } from "@/features/settings/server/dealer-id";
import { NO_CAR } from "@/lib/analytics/events";
import { countEvent } from "@/lib/analytics/store";
import { db } from "@/lib/db/client";
import { rateLimitKey } from "@/lib/rate-limit/key";
import { MemoryLimiter } from "@/lib/rate-limit/memory";
import { consume } from "@/lib/rate-limit/store";

// API-03 (FR-47.1, FR-47.4, BR-35): always 204 and no cookie; an event from the site's own page, a
// browser and a visitor without Global Privacy Control, with a body the schema takes, counts after
// the response, once it passes the limit of its network and, for a car event, names a car the site
// shows. Anything else is dropped and logged at DEBUG with its reason alone. The database's limit
// and the counts are the integration tests'.

vi.mock("@/lib/db/client", () => ({ db: { name: "db" } }));
vi.mock("@/lib/rate-limit/store", () => ({ consume: vi.fn() }));
vi.mock("@/lib/analytics/store", () => ({ countEvent: vi.fn() }));
vi.mock("@/features/inventory/server/inventory-index", () => ({ getPublicCarIds: vi.fn() }));
vi.mock("@/features/settings/server/dealer-id", () => ({ getDealerId: vi.fn() }));

const ORIGIN = "http://localhost:3000";
const SECRET = "unit-test-secret-not-a-real-one-0123456789";
const DEALER = "01923456-7890-7abc-8def-0000000000d1";
const CAR = "01923456-7890-7abc-8def-00000000000a";
const ADDRESS = "203.0.113.7";
const BROWSER =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";
// SRS §16's test clock, noon in Amman
const NOW = new Date("2026-10-18T09:00:00.000Z");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LIMIT = { max: 60, windowSeconds: 60 };
const CONTACT = { e: "contact_whatsapp", c: CAR, l: "ar" };
// API-03's cap on a body, 1 KB
const MAX_BYTES = 1024;

// As navigator.sendBeacon sends a string from the site's own page. A header set to null is left out.
const SENT = {
  "content-type": "text/plain;charset=UTF-8",
  "sec-fetch-site": "same-origin",
  origin: ORIGIN,
  "user-agent": BROWSER,
  "x-real-ip": ADDRESS,
};

function beacon(body: unknown, headers: Record<string, string | null> = {}): Request {
  const sent = new Headers(SENT);
  for (const [name, value] of Object.entries(headers)) {
    if (value === null) sent.delete(name);
    else sent.set(name, value);
  }
  // Bytes, so a request without a content type has none: a string would get text/plain
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Request(`${ORIGIN}/api/events`, { method: "POST", body: new TextEncoder().encode(text), headers: sent });
}

/** JSON of exactly this many bytes, padded with the spaces JSON allows after a value */
const padded = (body: unknown, bytes: number) => JSON.stringify(body).padEnd(bytes, " ");

/** A beacon whose body comes from the given source, as a browser's upload arrives */
function streamed(source: UnderlyingDefaultSource<Uint8Array>): Request {
  return new Request(`${ORIGIN}/api/events`, {
    method: "POST",
    body: new ReadableStream(source),
    headers: SENT,
    duplex: "half",
  } as RequestInit);
}

beforeEach(() => {
  vi.stubEnv("LOG_LEVEL", "debug");
  vi.stubEnv("RATE_LIMIT_HMAC_SECRET", SECRET);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);
  vi.mocked(consume).mockResolvedValue({ allowed: true });
  vi.mocked(countEvent).mockResolvedValue();
  vi.mocked(getDealerId).mockResolvedValue(DEALER);
  vi.mocked(getPublicCarIds).mockResolvedValue(new Set([CAR]));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// The handler logs through lib/log, one JSON line per console call. Its deferred work runs as it's
// scheduled, and settled() waits for it.
function setup(options: EventsHandlerOptions = {}) {
  const lines: string[] = [];
  for (const level of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((line: unknown) => {
      lines.push(String(line));
    });
  }
  const tasks: Promise<void>[] = [];
  let time = NOW;
  const POST = createEventsHandler({
    now: () => time,
    schedule: (task) => {
      tasks.push(task());
    },
    ...options,
  });
  return {
    POST,
    lines,
    logged: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>),
    scheduled: () => tasks.length,
    settled: () => Promise.all(tasks),
    setTime: (instant: Date) => {
      time = instant;
    },
  };
}

// NFR-OBS-01: each line places its request by its id, its route and how long it took
const dropped = (reason: string) => ({
  level: "debug",
  code: "event_dropped",
  requestId: expect.stringMatching(UUID),
  route: "/api/events",
  durationMs: expect.any(Number),
  reason,
});

async function expectNoContent(response: Response) {
  expect(response.status).toBe(204);
  expect(await response.text()).toBe("");
  expect(response.headers.get("set-cookie")).toBeNull();
}

describe("POST /api/events", () => {
  it("counts a car event after the response, in the day's row for the event, the car and the locale", async () => {
    const memory = vi.spyOn(MemoryLimiter.prototype, "consume");
    const { POST, settled, logged } = setup();
    await expectNoContent(await POST(beacon(CONTACT)));
    await settled();
    const key = rateLimitKey(SECRET, { scope: "network", route: "API-03", subject: ADDRESS }, NOW);
    // Both limits hold the coded key, never the address (FR-47.4, SEC-12)
    expect(memory.mock.calls).toStrictEqual([[key, NOW]]);
    expect(vi.mocked(consume).mock.calls).toStrictEqual([[db, key, LIMIT, NOW]]);
    expect(vi.mocked(getPublicCarIds).mock.calls).toStrictEqual([[DEALER]]);
    expect(vi.mocked(countEvent).mock.calls).toStrictEqual([
      [db, { day: "2026-10-18", event: "contact_whatsapp", carId: CAR, locale: "ar" }],
    ]);
    expect(logged()).toStrictEqual([]);
  });

  it("answers before it reads a limit or a list, or counts (SRS §11.5 rule 11)", async () => {
    const held: (() => Promise<void>)[] = [];
    const { POST } = setup({ schedule: (task) => void held.push(task) });
    await expectNoContent(await POST(beacon(CONTACT)));
    expect(held).toHaveLength(1);
    expect(vi.mocked(getPublicCarIds)).not.toHaveBeenCalled();
    expect(vi.mocked(consume)).not.toHaveBeenCalled();
    expect(vi.mocked(countEvent)).not.toHaveBeenCalled();
    await held[0]?.();
    expect(vi.mocked(countEvent)).toHaveBeenCalledTimes(1);
  });

  it("counts a site event under the zero car, without looking for a car", async () => {
    const { POST, settled } = setup();
    await expectNoContent(await POST(beacon({ e: "page_home", l: "en" })));
    await settled();
    expect(vi.mocked(getPublicCarIds)).not.toHaveBeenCalled();
    expect(vi.mocked(countEvent).mock.calls).toStrictEqual([
      [db, { day: "2026-10-18", event: "page_home", carId: NO_CAR, locale: "en" }],
    ]);
  });

  it.each([
    ["JSON", { "content-type": "application/json" }],
    ["a page from a browser that sends Origin but no Sec-Fetch-Site", { "sec-fetch-site": null }],
    ["a page that sends Sec-Fetch-Site but no Origin", { origin: null }],
    // GPC's one signal is the value 1
    ["a Sec-GPC header of another value", { "sec-gpc": "0" }],
  ])("takes %s", async (_, headers) => {
    const { POST, settled } = setup();
    await POST(beacon(CONTACT, headers));
    await settled();
    expect(vi.mocked(countEvent)).toHaveBeenCalledTimes(1);
  });

  it(`takes a body of ${MAX_BYTES} bytes`, async () => {
    const { POST, settled } = setup();
    await POST(beacon(padded(CONTACT, MAX_BYTES)));
    await settled();
    expect(vi.mocked(countEvent)).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "another site's page",
      CONTACT,
      { "sec-fetch-site": "cross-site", origin: "https://cars.example" },
      "cross_origin",
    ],
    ["a request that names no page", CONTACT, { "sec-fetch-site": null, origin: null }, "cross_origin"],
    ["a visitor with Global Privacy Control on (FR-47.3)", CONTACT, { "sec-gpc": "1" }, "gpc"],
    [
      "a bot",
      CONTACT,
      { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
      "bot",
    ],
    ["a request with no user agent", CONTACT, { "user-agent": null }, "bot"],
    ["a form's post", CONTACT, { "content-type": "application/x-www-form-urlencoded" }, "media_type"],
    ["a body with no media type", CONTACT, { "content-type": null }, "media_type"],
    [`a body over ${MAX_BYTES} bytes`, padded(CONTACT, MAX_BYTES + 1), {}, "too_large"],
    ["text that isn't JSON", "contact_whatsapp", {}, "invalid"],
    ["an event not on the list", { e: "page_admin", l: "ar" }, {}, "invalid"],
    ["a window card's scan, which API-29 counts on the server", { e: "window_scan", c: CAR, l: "ar" }, {}, "invalid"],
    ["a visit to the demo, which API-04 counts on the server", { e: "demo_dealer_entered", l: "en" }, {}, "invalid"],
    ["a key the schema doesn't take", { ...CONTACT, ref: "instagram" }, {}, "invalid"],
  ])("drops %s at once, with its reason", async (_, body, headers, reason) => {
    const { POST, logged, scheduled } = setup();
    await expectNoContent(await POST(beacon(body, headers)));
    expect(scheduled()).toBe(0);
    expect(logged()).toStrictEqual([dropped(reason)]);
  });

  it("checks a request in API-03's order, and drops it at the first check it fails", async () => {
    const { POST, logged } = setup();
    const tooLarge = padded(CONTACT, MAX_BYTES + 1);
    let headers: Record<string, string | null> = {
      "sec-fetch-site": "cross-site",
      origin: "https://cars.example",
      "sec-gpc": "1",
      "user-agent": "curl/8.7.1",
      "content-type": "application/x-www-form-urlencoded",
    };
    await POST(beacon(tooLarge, headers));
    // Each failure put right in turn moves the drop to the next check
    for (const fixed of [
      { "sec-fetch-site": "same-origin", origin: ORIGIN },
      { "sec-gpc": null },
      { "user-agent": BROWSER },
      { "content-type": "text/plain;charset=UTF-8" },
    ]) {
      headers = { ...headers, ...fixed };
      await POST(beacon(tooLarge, headers));
    }
    await POST(beacon("contact_whatsapp", headers));
    expect(logged().map(({ reason }) => reason)).toStrictEqual([
      "cross_origin",
      "gpc",
      "bot",
      "media_type",
      "too_large",
      "invalid",
    ]);
  });

  it.each([
    ["another site's page", { "sec-fetch-site": "cross-site", origin: "https://cars.example" }],
    ["a visitor with Global Privacy Control on", { "sec-gpc": "1" }],
    ["a bot", { "user-agent": "curl/8.7.1" }],
    ["a form's post", { "content-type": "application/x-www-form-urlencoded" }],
  ])("never reads the body of %s, dropped on its headers", async (_, headers) => {
    const { POST } = setup();
    const request = beacon(CONTACT, headers);
    await POST(request);
    expect(request.bodyUsed).toBe(false);
  });

  it("drops a request whose body breaks off, as a browser's upload can, with its reason", async () => {
    const { POST, logged, scheduled } = setup();
    const response = await POST(
      streamed({
        pull: (controller) => {
          controller.error(new TypeError("terminated"));
        },
      }),
    );
    await expectNoContent(response);
    expect(scheduled()).toBe(0);
    expect(logged()).toStrictEqual([dropped("unreadable")]);
  });

  it(`stops reading a body once it passes ${MAX_BYTES} bytes, and cancels the rest`, async () => {
    const cancel = vi.fn();
    const { POST } = setup();
    // A body that never ends: only a reader that stops at the cap gets an answer
    const response = POST(
      streamed({
        start: (controller) => {
          controller.enqueue(new Uint8Array(MAX_BYTES + 1));
        },
        cancel,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cancel).toHaveBeenCalledTimes(1);
    await expectNoContent(await response);
  });

  it("drops an event about a car the site doesn't show, before the database counts it", async () => {
    vi.mocked(getPublicCarIds).mockResolvedValue(new Set());
    const { POST, settled, logged } = setup();
    await expectNoContent(await POST(beacon(CONTACT)));
    await settled();
    expect(vi.mocked(consume)).not.toHaveBeenCalled();
    expect(vi.mocked(countEvent)).not.toHaveBeenCalled();
    expect(logged()).toStrictEqual([dropped("unknown_car")]);
  });

  it("drops a network's 61st event in a minute in memory, before the database, and counts another's", async () => {
    const { POST, settled, logged } = setup();
    for (let event = 0; event < 61; event += 1) await POST(beacon(CONTACT));
    await POST(beacon(CONTACT, { "x-real-ip": "198.51.100.20" }));
    await settled();
    // The memory's limit comes first, so the refused event reads neither the car list nor the database
    expect(vi.mocked(getPublicCarIds)).toHaveBeenCalledTimes(61);
    expect(vi.mocked(consume)).toHaveBeenCalledTimes(61);
    expect(vi.mocked(countEvent)).toHaveBeenCalledTimes(61);
    expect(logged()).toStrictEqual([dropped("rate_limited")]);
  });

  it("drops an event the database's limit refuses, which counts every instance's events", async () => {
    vi.mocked(consume).mockResolvedValue({ allowed: false, retryAfter: 30 });
    const { POST, settled, logged } = setup();
    await POST(beacon(CONTACT));
    await settled();
    expect(vi.mocked(countEvent)).not.toHaveBeenCalled();
    expect(logged()).toStrictEqual([dropped("rate_limited")]);
  });

  it("logs a client_error's page and code at WARN and counts it under the zero car (NFR-OBS-02)", async () => {
    const { POST, settled, logged } = setup();
    await POST(beacon({ e: "client_error", l: "en", r: "/[locale]/cars/[slug]", x: "CHUNK_GSAP" }));
    await settled();
    expect(logged()).toStrictEqual([
      {
        level: "warn",
        code: "client_error",
        requestId: expect.stringMatching(UUID),
        route: "/api/events",
        durationMs: expect.any(Number),
        page: "/[locale]/cars/[slug]",
        clientCode: "CHUNK_GSAP",
      },
    ]);
    expect(vi.mocked(countEvent).mock.calls).toStrictEqual([
      [db, { day: "2026-10-18", event: "client_error", carId: NO_CAR, locale: "en" }],
    ]);
  });

  it("logs a client_error only once its network's limit in memory takes it, so a flood writes no more", async () => {
    const { POST, settled, logged } = setup();
    for (let event = 0; event < 61; event += 1) {
      await POST(beacon({ e: "client_error", l: "en", r: "/[locale]", x: "SEGMENT" }));
    }
    await settled();
    const codes = logged().map(({ code }) => code);
    expect(codes.filter((code) => code === "client_error")).toHaveLength(60);
    expect(logged().filter(({ code }) => code === "event_dropped")).toStrictEqual([dropped("rate_limited")]);
  });

  it("logs no client_error the database's limit refuses", async () => {
    vi.mocked(consume).mockResolvedValue({ allowed: false, retryAfter: 30 });
    const { POST, settled, logged } = setup();
    await POST(beacon({ e: "client_error", l: "en", r: "/[locale]", x: "SEGMENT" }));
    await settled();
    expect(logged()).toStrictEqual([dropped("rate_limited")]);
  });

  it.each([
    ["the count", () => vi.mocked(countEvent).mockRejectedValue(new Error(`insert failed for ${ADDRESS}`))],
    ["the limit", () => vi.mocked(consume).mockRejectedValue(new TypeError(`fetch failed for ${ADDRESS}`))],
    ["the car list", () => vi.mocked(getPublicCarIds).mockRejectedValue(new Error("cache unreachable"))],
    ["the limit's key", () => vi.stubEnv("RATE_LIMIT_HMAC_SECRET", "")],
  ])("logs a failure of %s at ERROR, by the error's name alone, whose message may hold values", async (_, fail) => {
    fail();
    const { POST, settled, logged } = setup();
    await expectNoContent(await POST(beacon(CONTACT)));
    await settled();
    expect(logged()).toStrictEqual([
      {
        level: "error",
        code: "event_ingest_failed",
        requestId: expect.stringMatching(UUID),
        route: "/api/events",
        durationMs: expect.any(Number),
        error: expect.stringMatching(/^(Error|TypeError)$/),
      },
    ]);
  });

  it("counts by the date in Amman (BR-03)", async () => {
    const { POST, settled, setTime } = setup();
    setTime(new Date("2026-10-17T20:59:59.999Z"));
    await POST(beacon(CONTACT));
    setTime(new Date("2026-10-17T21:00:00.000Z"));
    await POST(beacon(CONTACT));
    await settled();
    expect(vi.mocked(countEvent).mock.calls.map(([, row]) => row.day)).toStrictEqual(["2026-10-17", "2026-10-18"]);
  });

  it("keeps no address, user agent or body in its log lines", async () => {
    vi.mocked(countEvent).mockRejectedValueOnce(new Error(`insert failed for ${ADDRESS}`));
    const { POST, settled, lines } = setup();
    await POST(beacon(CONTACT));
    await POST(beacon(CONTACT, { "sec-gpc": "1" }));
    await POST(beacon({ e: "page_admin", l: "ar", note: "secret-note" }));
    await POST(beacon({ e: "client_error", l: "ar", r: "/[locale]", x: "SEGMENT" }));
    await settled();
    expect(lines).toHaveLength(4);
    for (const leak of [ADDRESS, "iPhone", "Safari", "secret-note", "insert failed", CAR]) {
      for (const line of lines) expect(line).not.toContain(leak);
    }
  });

  it("names a request by the platform's request id where it has one", async () => {
    const { POST, logged } = setup();
    await POST(beacon(CONTACT, { "sec-gpc": "1", "x-vercel-id": "fra1::abcde-1730000000000-0123456789ab" }));
    expect(logged()).toMatchObject([{ requestId: "fra1::abcde-1730000000000-0123456789ab" }]);
  });
});
