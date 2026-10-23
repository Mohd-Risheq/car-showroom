"use client";
/* eslint-disable react-hooks/exhaustive-deps -- a measuring harness kept as it ran for its evidence; T-41 replaces it (D-037) */

import { useEffect, useRef, useState } from "react";
import { isSpinSetName, type SpinFormat, type SpinSetName } from "@/app/_dev/fixtures";
import { round } from "@/app/_dev/harness";
import { FrameMeter, LongTaskLog, type Stats, stats } from "@/app/_dev/meter";
import { postDevReport } from "@/app/_dev/report";
import type * as Spin from "@/features/spin";
import type { DecodeStrategy, DrawInfo, FrameRecord, FrameStore, SpinViewer } from "@/features/spin";
import { fixtureSource } from "./fixture";

// Spike T-05: the spin viewer on the synthetic fixture. "Run all" measures each setup in turn:
// loading, a stress pass that shows a new frame on every refresh, and three flicks. "Record"
// measures your own drags for 10 seconds. Results appear below as JSON, and with ?report=1 they
// are also sent to the Mac running the server (the phone session, BUILD-PLAN §4). With ?defer=1
// nothing loads until "Load frames", so memory can be measured before, with and after the frames.
// The engine arrives as one lazy chunk, as it will on the car page (T-41).

type SpinModule = typeof Spin;
type Config = { set: SpinSetName; format: SpinFormat; decode: DecodeStrategy };
type Release = { velocity: number; from: number; target: number };
type Session = {
  config: Config;
  store: FrameStore;
  viewer: SpinViewer;
  startedAt: number;
  records: Array<FrameRecord & { at: number }>;
  draws: DrawInfo[];
  releases: Release[];
  peakBytes: number;
  onInteract: (() => void) | null;
  onSettle: (() => void) | null;
  waiters: Array<{ ready: () => boolean; resolve: () => void }>;
};

const RUN_ALL: Config[] = [
  { set: "l36", format: "webp", decode: "worker" },
  { set: "l36", format: "webp", decode: "main" },
  { set: "l36", format: "jpg", decode: "worker" },
  { set: "l36", format: "jpg", decode: "main" },
  { set: "l72", format: "webp", decode: "worker" },
  { set: "l72", format: "jpg", decode: "worker" },
  { set: "p72", format: "jpg", decode: "worker" },
];
const FLICKS = [90, -60, 140]; // frames per second
const STRESS_REFRESHES = 240;
const RECORD_MS = 10_000;
const MIB = 1024 * 1024;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const roundStats = (value: Stats) => ({
  count: value.count,
  median: round(value.median),
  p95: round(value.p95),
  max: round(value.max),
});

function configFromUrl(params: URLSearchParams): Config {
  const set = params.get("set");
  return {
    set: isSpinSetName(set) ? set : "l36",
    format: params.get("format") === "jpg" ? "jpg" : "webp",
    decode: params.get("decode") === "main" ? "main" : "worker",
  };
}

function measureRefresh(): Promise<number> {
  return new Promise((resolve) => {
    const intervals: number[] = [];
    let last = 0;
    const tick = (now: number) => {
      if (last > 0) intervals.push(now - last);
      last = now;
      if (intervals.length < 90) requestAnimationFrame(tick);
      else resolve(stats(intervals).median);
    };
    requestAnimationFrame(tick);
  });
}

function environment(longTasks: LongTaskLog) {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { effectiveType?: string; saveData?: boolean };
  };
  return {
    userAgent: navigator.userAgent,
    devicePixelRatio: window.devicePixelRatio,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemory: nav.deviceMemory ?? null,
    connection: nav.connection
      ? { effectiveType: nav.connection.effectiveType ?? null, saveData: nav.connection.saveData ?? null }
      : null,
    requestIdleCallback: typeof window.requestIdleCallback === "function",
    longTaskTypes: longTasks.supported,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
}

function openSession(
  spin: SpinModule,
  config: Config,
  canvas: HTMLCanvasElement,
  locale: string,
  run: string | null,
  label: HTMLElement | null,
) {
  const startedAt = performance.now();
  let viewer: SpinViewer | undefined;
  const session = {} as Session;
  const store = new spin.FrameStore({
    source: fixtureSource(locale, config.set, config.format, run),
    decoder: spin.createDecoder(config.decode),
    onChange: () => {
      session.peakBytes = Math.max(session.peakBytes, store.decodedBytes());
      session.waiters = session.waiters.filter((waiter) => (waiter.ready() ? (waiter.resolve(), false) : true));
      viewer?.refresh();
    },
    onRecord: (record) => session.records.push({ ...record, at: performance.now() - startedAt }),
  });
  viewer = new spin.SpinViewer({
    canvas,
    store,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    onFrameChange: (index) => {
      if (label) label.textContent = `Frame ${index} of ${store.frames}`;
    },
    // Marks show each interaction window in a Performance panel trace
    onInteract: () => {
      performance.mark("spin-interact");
      session.onInteract?.();
    },
    onSettle: () => {
      performance.mark("spin-settle");
      session.onSettle?.();
    },
    onRelease: (release) => session.releases.push(release),
    onDraw: (draw) => session.draws.push(draw),
  });
  Object.assign(session, {
    config,
    store,
    viewer,
    startedAt,
    records: [],
    draws: [],
    releases: [],
    peakBytes: 0,
    onInteract: null,
    onSettle: null,
    waiters: [],
  } satisfies Session);
  store.loadFirstPass();
  return session;
}

function until(session: Session, ready: () => boolean, timeoutMs = 60_000): Promise<boolean> {
  if (ready()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    session.waiters.push({
      ready,
      resolve: () => {
        clearTimeout(timer);
        resolve(true);
      },
    });
  });
}

function closeSession(session: Session): number {
  session.viewer.destroy();
  session.store.dispose();
  return session.store.decodedBytes();
}

function drawStats(draws: DrawInfo[]) {
  return {
    count: draws.length,
    firstDrawMs: roundStats(stats(draws.filter((draw) => draw.first).map((draw) => draw.ms))),
    repeatDrawMs: roundStats(stats(draws.filter((draw) => !draw.first).map((draw) => draw.ms))),
  };
}

function loadStats(session: Session) {
  const { store, records } = session;
  const firstPassCount = Math.min(store.frames, 36);
  const low = records.filter((record) => !record.highRes);
  const firstPass = low.slice(0, firstPassCount);
  const rest = low.slice(firstPassCount);
  const high = records.filter((record) => record.highRes);
  const resized = records.filter((record) => record.requested !== null);
  const pass = (items: typeof records) => ({
    frames: items.length,
    encodedBytes: items.reduce((sum, record) => sum + record.encodedBytes, 0),
    doneMs: round(Math.max(0, ...items.map((record) => record.at))),
    fetchMs: roundStats(stats(items.map((record) => record.fetchMs))),
    decodeMs: roundStats(stats(items.map((record) => record.decodeMs))),
    size: items[0]?.size ?? null,
  });
  return {
    poster: high[0] ? { at: round(high[0].at), decodeMs: round(high[0].decodeMs), size: high[0].size } : null,
    firstPass: pass(firstPass),
    rest: pass(rest),
    highRes: pass(high),
    resize: {
      requested: resized.length,
      honoured: resized.filter((r) => r.size.width === r.requested?.width && r.size.height === r.requested?.height)
        .length,
    },
    failed: store.failed,
  };
}

async function stress(session: Session, refreshMs: number, longTasks: LongTaskLog) {
  const meter = new FrameMeter();
  session.draws.length = 0;
  meter.start();
  await new Promise<void>((resolve) => {
    let left = STRESS_REFRESHES;
    let position = session.viewer.frame;
    const step = () => {
      session.viewer.jumpTo(++position);
      if (--left > 0) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
  meter.stop();
  session.viewer.settleNow();
  return { meter: meter.summary(refreshMs, longTasks), draws: drawStats(session.draws) };
}

async function flicks(session: Session, refreshMs: number, longTasks: LongTaskLog) {
  const meter = new FrameMeter();
  session.draws.length = 0;
  session.releases.length = 0;
  for (const velocity of FLICKS) {
    const settled = new Promise<void>((resolve) => {
      session.onSettle = resolve;
    });
    meter.start();
    session.viewer.flick(velocity);
    await settled;
    meter.stop();
    session.onSettle = null;
    // The high-resolution swap at rest (FR-16.5) happens between flicks, outside the windows
    await sleep(600);
  }
  return {
    meter: meter.summary(refreshMs, longTasks),
    draws: drawStats(session.draws),
    releases: session.releases.map((release) => ({ ...release, from: round(release.from, 2) })),
  };
}

async function runConfig(
  spin: SpinModule,
  config: Config,
  canvas: HTMLCanvasElement,
  locale: string,
  refreshMs: number,
  longTasks: LongTaskLog,
  label: HTMLElement | null,
) {
  const run = Math.random().toString(36).slice(2, 10);
  const session = openSession(spin, config, canvas, locale, run, label);
  const { store } = session;
  const firstPassCount = Math.min(store.frames, 36);
  const firstPassLoaded = await until(session, () => store.loaded + store.failed >= firstPassCount);
  await sleep(400);
  const stressed = await stress(session, refreshMs, longTasks);
  const allLoaded = await until(session, () => store.loaded + store.failed >= store.frames);
  await sleep(600);
  const flicked = await flicks(session, refreshMs, longTasks);
  const loading = loadStats(session);
  const low = spin.fitInside(fixtureSource(locale, config.set, config.format, null).lowRes(0).size, spin.LOW_RES_BOX);
  const peakBytes = session.peakBytes;
  const afterClose = closeSession(session);
  return {
    config,
    complete: { firstPass: firstPassLoaded, allFrames: allLoaded },
    loading,
    stress: stressed,
    flicks: flicked,
    memory: {
      peakDecodedMiB: round(peakBytes / MIB, 2),
      expectedLowResMiB: round((store.frames * spin.bitmapBytes(low)) / MIB, 2),
      afterCloseBytes: afterClose,
    },
  };
}

type Results = {
  kind: "t05-spin";
  page: string;
  at: string;
  environment: ReturnType<typeof environment>;
  refreshMs: number;
  runs: Awaited<ReturnType<typeof runConfig>>[];
  recordings: unknown[];
  errors: string[];
};

export function SpinSpike() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const sessionRef = useRef<Session | null>(null);
  const resultsRef = useRef<Results | null>(null);
  const contextRef = useRef<{
    spin: SpinModule;
    locale: string;
    refreshMs: number;
    longTasks: LongTaskLog;
    config: Config;
    report: boolean;
    defer: boolean;
  } | null>(null);
  const [state, setState] = useState<"starting" | "idle" | "running" | "done" | "failed">("starting");
  const [failure, setFailure] = useState<string | null>(null);
  const [json, setJson] = useState("");
  const [sent, setSent] = useState("");

  const publish = async () => {
    const results = resultsRef.current;
    const context = contextRef.current;
    if (!results || !context) return;
    setJson(JSON.stringify(results, null, 2));
    if (!context.report) return;
    setSent((await postDevReport(context.locale, results)).message);
  };

  const reopen = () => {
    const context = contextRef.current;
    const canvas = canvasRef.current;
    if (!context || !canvas || sessionRef.current) return;
    sessionRef.current = openSession(context.spin, context.config, canvas, context.locale, null, labelRef.current);
  };

  const release = () => {
    if (sessionRef.current) closeSession(sessionRef.current);
    sessionRef.current = null;
  };

  const runAll = async (configs: Config[]) => {
    const context = contextRef.current;
    const canvas = canvasRef.current;
    const results = resultsRef.current;
    if (!context || !canvas || !results) return;
    setState("running");
    release();
    for (const config of configs) {
      try {
        results.runs.push(
          await runConfig(
            context.spin,
            config,
            canvas,
            context.locale,
            context.refreshMs,
            context.longTasks,
            labelRef.current,
          ),
        );
      } catch (error) {
        results.errors.push(`${config.set} ${config.format} ${config.decode}: ${String(error)}`);
      }
    }
    reopen();
    await publish();
    setState("done");
  };

  const record = async () => {
    const context = contextRef.current;
    const session = sessionRef.current;
    const results = resultsRef.current;
    if (!context || !session || !results) return;
    setState("running");
    const meter = new FrameMeter();
    session.draws.length = 0;
    session.releases.length = 0;
    session.onInteract = () => meter.start();
    session.onSettle = () => meter.stop();
    await sleep(RECORD_MS);
    meter.stop();
    session.onInteract = null;
    session.onSettle = null;
    results.recordings.push({
      config: session.config,
      meter: meter.summary(context.refreshMs, context.longTasks),
      draws: drawStats(session.draws),
      releases: session.releases.map((release) => ({ ...release, from: round(release.from, 2) })),
      peakDecodedMiB: round(session.peakBytes / MIB, 2),
    });
    await publish();
    setState("done");
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const params = new URLSearchParams(window.location.search);
    const locale = window.location.pathname.split("/")[1] ?? "en";
    const longTasks = new LongTaskLog();
    let cancelled = false;
    void Promise.all([import("@/features/spin"), measureRefresh()]).then(
      ([spin, refreshMs]) => {
        if (cancelled) return;
        const config = configFromUrl(params);
        const defer = params.get("defer") === "1";
        contextRef.current = {
          spin,
          locale,
          refreshMs,
          longTasks,
          config,
          report: params.get("report") === "1",
          defer,
        };
        resultsRef.current = {
          kind: "t05-spin",
          page: window.location.pathname + window.location.search,
          at: new Date().toISOString(),
          environment: environment(longTasks),
          refreshMs: round(refreshMs, 2),
          runs: [],
          recordings: [],
          errors: [],
        };
        if (!defer) reopen();
        setState("idle");
        if (params.get("auto") === "1") void runAll(RUN_ALL);
      },
      (reason: unknown) => {
        // The viewer's chunk didn't load (over the tunnel, say): say so instead of staying at "starting"
        if (cancelled) return;
        setFailure(String(reason));
        setState("failed");
      },
    );
    const status = setInterval(() => {
      const element = statusRef.current;
      if (!element) return;
      const session = sessionRef.current;
      if (!session) {
        element.textContent = "No frames loaded";
        element.dataset.loaded = "0";
        element.dataset.decodedBytes = "0";
        element.dataset.highRes = "false";
        return;
      }
      const { store, config, viewer } = session;
      element.textContent = `${config.set} ${config.format}, decoded in ${config.decode === "worker" ? "a worker" : "the page"}: ${store.loaded} of ${store.frames} loaded, ${store.failed} failed, ${round(store.decodedBytes() / MIB, 1)} MiB decoded`;
      element.dataset.loaded = String(store.loaded);
      element.dataset.frames = String(store.frames);
      element.dataset.decodedBytes = String(store.decodedBytes());
      element.dataset.highRes = String(store.high(viewer.frame) !== undefined);
    }, 250);
    return () => {
      cancelled = true;
      clearInterval(status);
      longTasks.disconnect();
      if (sessionRef.current) closeSession(sessionRef.current);
      sessionRef.current = null;
    };
    // Runs once per page load: changing the setup loads the page again
  }, []);

  const busy = state !== "idle" && state !== "done";
  const link = (set: SpinSetName, format: SpinFormat, decode: DecodeStrategy) =>
    `?set=${set}&format=${format}&decode=${decode}`;

  return (
    <section data-state={state} className="grid max-w-180 gap-4">
      <nav className="flex flex-wrap gap-x-4 gap-y-1">
        {RUN_ALL.map(({ set, format, decode }) => (
          <a key={`${set}-${format}-${decode}`} href={link(set, format, decode)} className="underline">
            {set} {format} {decode}
          </a>
        ))}
      </nav>

      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-roledescription="360 degree viewer"
        aria-label="Synthetic spin fixture"
        className="block aspect-[3/2] w-full bg-surface-1"
      />
      {/* FR-16.4: physical sides in both directions, never mirrored (BR-17) */}
      <div dir="ltr" className="flex items-center justify-between gap-4">
        <button type="button" className="min-h-11 border px-4" onClick={() => sessionRef.current?.viewer.rotateBy(-1)}>
          Rotate left
        </button>
        {/* Not a live region: it changes on every frame of a drag. T-41 announces keyboard
            rotation only (DESIGN §5.4). */}
        <span ref={labelRef} data-frame-label>
          Frame 0
        </span>
        <button type="button" className="min-h-11 border px-4" onClick={() => sessionRef.current?.viewer.rotateBy(1)}>
          Rotate right
        </button>
      </div>
      <p ref={statusRef} data-status className="text-xs" />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="min-h-11 border px-4"
          data-action="run-all"
          onClick={() => void runAll(RUN_ALL)}
        >
          Run all setups
        </button>
        <button
          type="button"
          disabled={busy}
          className="min-h-11 border px-4"
          data-action="run-this"
          onClick={() => contextRef.current && void runAll([contextRef.current.config])}
        >
          Run this setup
        </button>
        <button
          type="button"
          disabled={busy}
          className="min-h-11 border px-4"
          data-action="record"
          onClick={() => void record()}
        >
          Record my drags (10 s)
        </button>
        <button type="button" disabled={busy} className="min-h-11 border px-4" data-action="load" onClick={reopen}>
          Load frames
        </button>
        <button type="button" disabled={busy} className="min-h-11 border px-4" data-action="release" onClick={release}>
          Release frames
        </button>
        <button
          type="button"
          disabled={!json}
          className="min-h-11 border px-4"
          onClick={() => void navigator.clipboard?.writeText(json)}
        >
          Copy results
        </button>
      </div>
      <p className="text-xs">{state === "running" ? "Measuring. Keep this tab in front." : sent}</p>
      {failure ? <p role="alert">Spike failed: {failure}</p> : null}

      {json ? (
        <pre data-results dir="ltr" className="overflow-x-auto whitespace-pre-wrap text-xs">
          {json}
        </pre>
      ) : null}
    </section>
  );
}
