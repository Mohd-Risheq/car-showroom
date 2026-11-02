import { afterEach, describe, expect, it, vi } from "vitest";
import { type BeaconEvent, type CarEvent, EVENT_SUBJECTS } from "@/lib/analytics/events";
import { EVENT_NAMES } from "@/lib/db/enums";

// FR-47's client (src/lib/analytics/track.ts and its lazy beacon.ts): a page view starts on each
// navigation to a new pathname (FR-47.6), a signature feature and race_run send once in one, as do
// the page events, while contacts and shares send each time (FR-25.7); a visitor with Global Privacy
// Control on sends nothing and loads nothing (FR-47.3); a client error names its page by its route
// template, once per code and template, and at most five times a document, and an error nothing
// caught counts where the site's own scripts threw it (NFR-OBS-02).

const ORIGIN = "https://muftah.test";
const CAR = "01923456-7890-7abc-8def-00000000000a";
const OTHER_CAR = "01923456-7890-7abc-8def-00000000000b";

type ErrorListener = (event: Pick<ErrorEvent, "filename" | "error">) => void;

/** The page's browser: its address, its beacons, its error listeners and its GPC setting */
const page = {
  location: new URL(`${ORIGIN}/ar`),
  beacons: [] as unknown[],
  errorListeners: [] as ErrorListener[],
};

/**
 * The client as a page first loads it, at a path, before any event, with GPC on or off, in a browser
 * that sends beacons unless told otherwise
 */
async function loadClient({
  path = "/ar",
  gpc,
  beacons = true,
}: { path?: string; gpc?: boolean; beacons?: boolean } = {}) {
  Object.assign(page, { location: new URL(`${ORIGIN}${path}`), beacons: [], errorListeners: [] });
  vi.stubGlobal("location", page.location);
  const sendBeacon = (url: string, body: string) => {
    expect(url).toBe("/api/events");
    page.beacons.push(JSON.parse(body));
    return true;
  };
  vi.stubGlobal("navigator", {
    ...(gpc === undefined ? {} : { globalPrivacyControl: gpc }),
    ...(beacons ? { sendBeacon } : {}),
  });
  vi.stubGlobal("addEventListener", (type: string, listener: ErrorListener) => {
    if (type === "error") page.errorListeners.push(listener);
  });
  vi.stubGlobal("removeEventListener", (type: string, listener: ErrorListener) => {
    if (type === "error") page.errorListeners = page.errorListeners.filter((kept) => kept !== listener);
  });
  vi.resetModules();
  const client = await import("@/lib/analytics/track");
  client.notePath(page.location.pathname);
  return client;
}

/** Moves the page to a path, as a client-side navigation does before the new page's effects run */
function navigate(client: { notePath: (path: string) => void }, path: string) {
  page.location.pathname = path;
  client.notePath(path);
}

/** The beacons sent once the client has had time to load its chunk and send */
async function sent(count: number): Promise<unknown[]> {
  await vi.waitFor(() => expect(page.beacons.length).toBeGreaterThanOrEqual(count));
  // Anything sent after the last expected beacon would be a beacon too many
  await new Promise((resolve) => setTimeout(resolve, 10));
  return page.beacons;
}

afterEach(() => {
  vi.doUnmock("@/lib/analytics/beacon");
});

// What a page view sends once and what it sends each time, as FR-47.6 and FR-25.7 have it: written
// here, not read from beacon.ts, so a change to beacon.ts's list fails until this agrees
const SENDS = {
  page_home: "once",
  page_inventory: "once",
  car_view: "once",
  sig_body_scan: "once",
  sig_sound_play: "once",
  sig_spin: "once",
  sig_journey: "once",
  sig_cost: "once",
  race_run: "once",
  contact_whatsapp: "each time",
  contact_call: "each time",
  contact_viewing: "each time",
  share_family: "each time",
  share_native: "each time",
  garage_save: "each time",
  compare_add: "each time",
  car_published: "each time",
  share_kit_generate: "each time",
  reel_generated: "each time",
} as const satisfies Record<BeaconEvent, "once" | "each time">;

// The server counts these itself (API-29, API-04), and an error has a call of its own
const NOT_SENT: ReadonlySet<string> = new Set(["window_scan", "demo_dealer_entered", "client_error"]);
const SENT_EVENTS = EVENT_NAMES.filter((name): name is BeaconEvent => !NOT_SENT.has(name));
const isCarEvent = (event: BeaconEvent): event is Extract<BeaconEvent, CarEvent> => EVENT_SUBJECTS[event] === "car";

describe("a page view (FR-47.6)", () => {
  it("sends sig_spin and sig_cost once each, and sig_spin again on the next car's page (TC-47-5)", async () => {
    const client = await loadClient({ path: "/ar/cars/2021-toyota-rav4" });
    for (let i = 0; i < 3; i += 1) client.track("sig_spin", CAR);
    for (let i = 0; i < 2; i += 1) client.track("sig_cost", CAR);
    navigate(client, "/ar/cars/2020-kia-sportage");
    client.track("sig_spin", OTHER_CAR);
    expect(await sent(3)).toStrictEqual([
      { e: "sig_spin", c: CAR, l: "ar" },
      { e: "sig_cost", c: CAR, l: "ar" },
      { e: "sig_spin", c: OTHER_CAR, l: "ar" },
    ]);
  });

  it("starts on a return to a page left before, though the page between sent nothing", async () => {
    const client = await loadClient({ path: "/en/cars/2021-toyota-rav4" });
    client.track("sig_journey", CAR);
    navigate(client, "/en/cars");
    navigate(client, "/en/cars/2021-toyota-rav4");
    client.track("sig_journey", CAR);
    expect(await sent(2)).toStrictEqual([
      { e: "sig_journey", c: CAR, l: "en" },
      { e: "sig_journey", c: CAR, l: "en" },
    ]);
  });

  it("goes on through a new query or a second note of the same path", async () => {
    const client = await loadClient({ path: "/ar" });
    client.track("race_run");
    client.notePath("/ar");
    client.track("race_run");
    expect(await sent(1)).toStrictEqual([{ e: "race_run", l: "ar" }]);
  });

  it("sends a page's own event once, though the page's effect runs twice", async () => {
    const client = await loadClient({ path: "/ar/cars/2021-toyota-rav4" });
    client.track("car_view", CAR);
    client.track("car_view", CAR);
    navigate(client, "/ar/cars");
    client.track("page_inventory");
    client.track("page_inventory");
    expect(await sent(2)).toStrictEqual([
      { e: "car_view", c: CAR, l: "ar" },
      { e: "page_inventory", l: "ar" },
    ]);
  });

  it("sends every contact, share and save, each time (FR-25.7)", async () => {
    const client = await loadClient({ path: "/en/cars/2021-toyota-rav4" });
    const events = ["contact_whatsapp", "contact_call", "share_native", "garage_save"] as const;
    for (const event of [...events, ...events]) client.track(event, CAR);
    expect(await sent(8)).toStrictEqual([...events, ...events].map((event) => ({ e: event, c: CAR, l: "en" })));
  });

  it.each(SENT_EVENTS)("sends %s as the table says, sent twice in one page view", async (event) => {
    const client = await loadClient({ path: "/en/cars/2021-toyota-rav4" });
    for (let i = 0; i < 2; i += 1) {
      if (isCarEvent(event)) client.track(event, CAR);
      else client.track(event);
    }
    const expected = SENDS[event] === "once" ? 1 : 2;
    expect(await sent(expected)).toHaveLength(expected);
  });

  it("can't send the events the server counts itself, nor an error, which has its own call (API-03)", async () => {
    // The type checker holds the rule: pnpm typecheck reads the tests. GPC on, so these send nothing.
    const client = await loadClient({ path: "/en/cars/2021-toyota-rav4", gpc: true });
    // @ts-expect-error: API-29 counts a window card's scan on the server
    client.track("window_scan", CAR);
    // @ts-expect-error: API-04 counts a visit to the demo on the server
    client.track("demo_dealer_entered");
    // @ts-expect-error: a client error goes through reportClientError, with its code
    client.track("client_error");
    expect(SENT_EVENTS).toHaveLength(EVENT_NAMES.length - NOT_SENT.size);
  });
});

describe("an event's language", () => {
  it("is the page's, from its path, and the site's default on a path that names none", async () => {
    const client = await loadClient({ path: "/en/cars" });
    client.track("page_inventory");
    navigate(client, "/fr/cars");
    client.track("page_inventory");
    expect(await sent(2)).toStrictEqual([
      { e: "page_inventory", l: "en" },
      { e: "page_inventory", l: "ar" },
    ]);
  });
});

describe("Global Privacy Control (FR-47.3)", () => {
  it("sends nothing and loads nothing when it's on", async () => {
    let loads = 0;
    vi.doMock("@/lib/analytics/beacon", () => {
      loads += 1;
      return {};
    });
    const client = await loadClient({ path: "/ar/cars/2021-toyota-rav4", gpc: true });
    client.watchUncaughtErrors();
    client.track("car_view", CAR);
    client.track("contact_whatsapp", CAR);
    client.reportClientError("SEGMENT");
    for (const listener of page.errorListeners) listener({ filename: `${ORIGIN}/a.js`, error: new Error("uncaught") });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(loads).toBe(0);
    expect(page.beacons).toStrictEqual([]);
  });

  it("sends when it's off", async () => {
    const client = await loadClient({ path: "/ar", gpc: false });
    client.track("page_home");
    expect(await sent(1)).toStrictEqual([{ e: "page_home", l: "ar" }]);
  });
});

describe("a browser with beacons turned off", () => {
  it("loses its events, as offline, and loads nothing to send them", async () => {
    let loads = 0;
    vi.doMock("@/lib/analytics/beacon", async (importOriginal) => {
      loads += 1;
      return importOriginal();
    });
    const client = await loadClient({ path: "/ar/cars/2021-toyota-rav4", beacons: false });
    client.track("car_view", CAR);
    client.reportClientError("SEGMENT");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(loads).toBe(0);
  });
});

describe("the beacon's chunk", () => {
  it("loads again on the next event after a failed load, whose event is lost, as offline", async () => {
    let loads = 0;
    vi.doMock("@/lib/analytics/beacon", async (importOriginal) => {
      loads += 1;
      if (loads === 1) throw new Error("Failed to load the chunk, as offline");
      return importOriginal();
    });
    const client = await loadClient({ path: "/ar" });
    client.track("page_home");
    await vi.waitFor(() => expect(loads).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 10));
    client.track("race_run");
    expect(await sent(1)).toStrictEqual([{ e: "race_run", l: "ar" }]);
    expect(loads).toBe(2);
  });
});

describe("a client error (NFR-OBS-02)", () => {
  it("names its page by the route template and its code, never the path", async () => {
    const client = await loadClient({ path: "/en/cars/2021-toyota-rav4" });
    client.reportClientError("CHUNK_GSAP");
    expect(await sent(1)).toStrictEqual([{ e: "client_error", l: "en", r: "/[locale]/cars/[slug]", x: "CHUNK_GSAP" }]);
  });

  it("names the page it happened on, though the page has changed by the time it's sent", async () => {
    const client = await loadClient({ path: "/ar/cars" });
    client.reportClientError("SEGMENT");
    navigate(client, "/en");
    expect(await sent(1)).toStrictEqual([{ e: "client_error", l: "ar", r: "/[locale]/cars", x: "SEGMENT" }]);
  });

  it("sends a code once per route template, and at most five errors a document", async () => {
    const client = await loadClient({ path: "/ar/cars/2021-toyota-rav4" });
    client.reportClientError("CHUNK_MOTION");
    client.reportClientError("CHUNK_MOTION");
    navigate(client, "/ar/cars/2020-kia-sportage");
    client.reportClientError("CHUNK_MOTION");
    for (const path of ["/ar", "/ar/cars", "/ar/visit", "/ar/garage", "/ar/compare"]) {
      navigate(client, path);
      client.reportClientError("CHUNK_MOTION");
    }
    expect((await sent(5)).map((beacon) => (beacon as { r: string }).r)).toStrictEqual([
      "/[locale]/cars/[slug]",
      "/[locale]",
      "/[locale]/cars",
      "/[locale]/visit",
      "/[locale]/garage",
    ]);
  });

  it("counts an error once, whichever reports it first", async () => {
    const client = await loadClient({ path: "/ar" });
    client.watchUncaughtErrors();
    const error = new Error("The arrival failed");
    client.reportClientError("ARRIVAL", error);
    for (const listener of page.errorListeners) listener({ filename: `${ORIGIN}/_next/static/chunks/a.js`, error });
    expect(await sent(1)).toStrictEqual([{ e: "client_error", l: "ar", r: "/[locale]", x: "ARRIVAL" }]);
  });

  it("reports an uncaught error from the site's own scripts as UNCAUGHT, and none from elsewhere", async () => {
    const client = await loadClient({ path: "/en/visit" });
    client.watchUncaughtErrors();
    const [listener] = page.errorListeners;
    // Each on a page of its own, as one page's errors send once: another origin's script, whose error
    // the browser mutes, a script from elsewhere, a browser extension's and a look-alike origin's
    const elsewhere = [
      ["/en", { filename: "", error: null }],
      ["/en/cars", { filename: "https://cdn.example/widget.js", error: new Error("theirs") }],
      [
        "/en/garage",
        { filename: "chrome-extension://abcdefghijklmnop/content.js", error: new Error("an extension's") },
      ],
      ["/en/compare", { filename: `${ORIGIN}.example/x.js`, error: new Error("a look-alike origin's") }],
    ] as const;
    for (const [path, event] of elsewhere) {
      navigate(client, path);
      listener?.(event);
    }
    navigate(client, "/en/visit");
    listener?.({ filename: `${ORIGIN}/_next/static/chunks/b.js`, error: new Error("the site's") });
    expect(await sent(1)).toStrictEqual([{ e: "client_error", l: "en", r: "/[locale]/visit", x: "UNCAUGHT" }]);
  });

  it("counts an inline script's error as the site's, as its address is the page's, whoever put it there", async () => {
    const client = await loadClient({ path: "/en/cars/2021-toyota-rav4" });
    client.watchUncaughtErrors();
    for (const listener of page.errorListeners) {
      listener({ filename: `${ORIGIN}/en/cars/2021-toyota-rav4`, error: new Error("an inline script's") });
    }
    expect(await sent(1)).toStrictEqual([{ e: "client_error", l: "en", r: "/[locale]/cars/[slug]", x: "UNCAUGHT" }]);
  });

  it("stops listening when the watch stops, and loads the chunk only once there is an error", async () => {
    let loads = 0;
    vi.doMock("@/lib/analytics/beacon", async (importOriginal) => {
      loads += 1;
      return importOriginal();
    });
    const client = await loadClient({ path: "/en" });
    const stop = client.watchUncaughtErrors();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(loads).toBe(0);
    expect(page.errorListeners).toHaveLength(1);
    stop();
    expect(page.errorListeners).toStrictEqual([]);
  });
});
