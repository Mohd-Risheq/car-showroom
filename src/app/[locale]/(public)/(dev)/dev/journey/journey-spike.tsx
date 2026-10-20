"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { journeySteps } from "@/features/journey/domain/route";
import { JourneyGlobe } from "@/features/journey/ui/journey-globe";
import { FrameMeter, LongTaskLog, round, stats } from "../spin/meter";
import { isRouteKey, placesOf, ROUTES, type RouteKey } from "./fixture";
import { NativeArcs } from "./native-arcs";

// Spike T-09's globe. The timeline makes a milestone active by scroll (two columns), tap or
// keyboard focus (FR-17.2). "Run" steps through the milestones, timing each step from activation
// until the globe settles (≤ 900 ms, FR-17.2) and the frames in between. Results appear below as
// JSON, and with ?report=1 they are also sent to the Mac running the server (the phone session,
// BUILD-PLAN §4). ?run=1 runs once the globe shows, ?route=pacific takes the antimeridian route
// and ?compare=1 adds cobe's own arcs on the same route, for D-031.

type Summary = { median: number; p95: number; max: number };
type StepResult = { index: number; kind: string; settleMs: number | null; globeFrames: number; frameCpuMs: Summary };
type LazyScript = { url: string; transferBytes: number; encodedBytes: number; decodedBytes: number };
type Results = {
  kind: "t09-journey";
  page: string;
  at: string;
  environment: Record<string, string | number | null>;
  route: RouteKey;
  view: "globe" | "static";
  lazyScripts: LazyScript[];
  steps: StepResult[];
  frames: ReturnType<FrameMeter["summary"]> | null;
  errors: string[];
};

const STEP_TIMEOUT_MS = 3000;
const PAUSE_MS = 400;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const summarise = (values: number[]): Summary => {
  const value = stats(values);
  return { median: round(value.median, 2), p95: round(value.p95, 2), max: round(value.max, 2) };
};
const scripts = () =>
  performance
    .getEntriesByType("resource")
    .filter((entry): entry is PerformanceResourceTiming => entry instanceof PerformanceResourceTiming && entry.initiatorType === "script");

function measureRefresh(): Promise<number> {
  return new Promise((resolve) => {
    const intervals: number[] = [];
    let last = 0;
    const tick = (now: number) => {
      if (last > 0) intervals.push(now - last);
      last = now;
      if (intervals.length < 60) requestAnimationFrame(tick);
      else resolve(stats(intervals).median);
    };
    requestAnimationFrame(tick);
  });
}

export function JourneySpike({ maps }: { maps: Record<RouteKey, ReactNode> }) {
  const [route, setRoute] = useState<RouteKey>("tc-17-1");
  const [active, setActive] = useState(-1);
  const [view, setView] = useState<"globe" | "static">("static");
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [compare, setCompare] = useState(false);
  const [json, setJson] = useState("");
  const [sent, setSent] = useState("");
  const list = useRef<HTMLOListElement>(null);
  const meter = useRef<FrameMeter | null>(null);
  const longTasks = useRef<LongTaskLog | null>(null);
  const frameCpu = useRef<number[]>([]);
  const settled = useRef<Array<() => void>>([]);
  const initialScripts = useRef(new Set<string>());
  const lazy = useRef<LazyScript[]>([]);
  const options = useRef({ run: false, report: false, locale: "en" });
  const running = useRef(false);
  const shown = useRef<"globe" | "static">("static");

  const places = useMemo(() => placesOf(route), [route]);
  const steps = useMemo(() => journeySteps(places), [places]);
  const milestones = ROUTES[route].milestones;
  const current = milestones[active];

  const onFrame = useCallback((cpuMs: number) => {
    frameCpu.current.push(cpuMs);
  }, []);
  const onSettle = useCallback(() => {
    meter.current?.stop();
    for (const resolve of settled.current.splice(0)) resolve();
  }, []);
  const onShow = useCallback((globe: boolean) => {
    shown.current = globe ? "globe" : "static";
    setView(shown.current);
    if (!globe) return;
    // The scripts that arrived after the page loaded: the globe's lazy chunk
    lazy.current = scripts()
      .filter((entry) => !initialScripts.current.has(entry.name))
      .map((entry) => ({
        url: new URL(entry.name).pathname,
        transferBytes: entry.transferSize,
        encodedBytes: entry.encodedBodySize,
        decodedBytes: entry.decodedBodySize,
      }));
  }, []);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setState("running");
    setActive(-1);
    await sleep(PAUSE_MS);
    const refreshMs = await measureRefresh();
    const frames = new FrameMeter();
    meter.current = frames;
    const results: StepResult[] = [];
    const errors: string[] = [];
    for (const step of steps) {
      frameCpu.current = [];
      const began = performance.now();
      const settle = new Promise<number | null>((resolve) => {
        settled.current.push(() => resolve(performance.now() - began));
        setTimeout(() => resolve(null), STEP_TIMEOUT_MS);
      });
      frames.start();
      setActive(step.index);
      const settleMs = await settle;
      frames.stop();
      if (settleMs === null) errors.push(`step ${step.index} did not settle within ${STEP_TIMEOUT_MS} ms`);
      results.push({
        index: step.index,
        kind: step.kind,
        settleMs: settleMs === null ? null : round(settleMs),
        globeFrames: frameCpu.current.length,
        frameCpuMs: summarise(frameCpu.current),
      });
      await sleep(PAUSE_MS);
    }
    const nav = navigator as Navigator & { deviceMemory?: number };
    const report: Results = {
      kind: "t09-journey",
      page: window.location.pathname + window.location.search,
      at: new Date().toISOString(),
      environment: {
        userAgent: navigator.userAgent,
        devicePixelRatio: window.devicePixelRatio,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        hardwareConcurrency: navigator.hardwareConcurrency ?? null,
        deviceMemory: nav.deviceMemory ?? null,
        refreshMs: round(refreshMs, 2),
      },
      route,
      view: shown.current,
      lazyScripts: lazy.current,
      steps: results,
      frames: longTasks.current ? frames.summary(refreshMs, longTasks.current) : null,
      errors,
    };
    const text = JSON.stringify(report, null, 2);
    setJson(text);
    running.current = false;
    setState("done");
    if (!options.current.report) return;
    try {
      const response = await fetch(`/${options.current.locale}/dev/report`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: text,
      });
      const body = (await response.json().catch(() => null)) as { saved?: string } | null;
      setSent(response.ok ? `Sent to the Mac: ${body?.saved ?? "saved"}` : `Sending failed: ${response.status}`);
    } catch (error) {
      setSent(`Sending failed: ${String(error)}`);
    }
  }, [route, steps]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("route");
    options.current = {
      run: params.get("run") === "1",
      report: params.get("report") === "1",
      locale: window.location.pathname.split("/")[1] ?? "en",
    };
    for (const entry of scripts()) initialScripts.current.add(entry.name);
    longTasks.current = new LongTaskLog();
    // Read once from the address: the route and the comparison stay as the page was opened
    const timer = setTimeout(() => {
      if (isRouteKey(requested)) setRoute(requested);
      setCompare(params.get("compare") === "1");
    });
    return () => {
      clearTimeout(timer);
      longTasks.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (view === "globe" && options.current.run && !running.current) void run();
  }, [view, run]);

  // Two columns: the milestone crossing the middle of the viewport is the active one (DESIGN §5.5)
  useEffect(() => {
    const items = list.current?.querySelectorAll("li");
    const wide = matchMedia("(min-width: 768px)");
    if (!items) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!wide.matches || running.current) return;
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index));
        }
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    for (const item of items) observer.observe(item);
    return () => observer.disconnect();
  }, [route]);

  return (
    <section data-state={state} data-view={view} data-testid="journey" className="grid gap-6">
      <h2 className="text-base">Globe (FR-17.1, FR-17.2, FR-17.5, FR-17.8): {ROUTES[route].title}</h2>
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" className="underline" onClick={() => void run()} disabled={state === "running"}>
          Run the steps
        </button>
        <span style={{ color: "var(--muted)" }}>
          Showing the {view === "globe" ? "globe" : "static map"}. Drag the globe to turn it.
        </span>
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
        <div className="sticky top-0 z-10 self-start py-2 md:top-[10vh]" style={{ background: "var(--bg)" }}>
          <div className="mx-auto w-full max-w-[280px] md:max-w-[520px]">
            <JourneyGlobe key={route} places={places} active={active} onFrame={onFrame} onSettle={onSettle} onShow={onShow}>
              {maps[route]}
            </JourneyGlobe>
          </div>
          <p className="mt-2 text-center" data-testid="caption" style={{ color: "var(--muted)" }}>
            {current ? `${current.type} · ${current.place} · ${current.month}` : "Choose a milestone"}
          </p>
        </div>

        <ol ref={list} key={route} className="grid gap-2 md:gap-0">
          {milestones.map((milestone, index) => (
            <li key={`${milestone.type}-${milestone.month}`} data-index={index} className="md:flex md:min-h-[45vh] md:items-center">
              <button
                type="button"
                className="w-full p-3 text-start"
                aria-current={index === active ? "step" : undefined}
                style={{ background: index === active ? "var(--surface-1)" : "transparent" }}
                onClick={() => setActive(index)}
                onFocus={() => setActive(index)}
              >
                {index + 1}. {milestone.type} · {milestone.place} · {milestone.month}
                {milestone.note ? ` · ${milestone.note}` : ""}
                <span className="block" style={{ color: "var(--muted)" }}>
                  step: {steps[index]?.kind}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      {compare ? (
        <div className="grid gap-4 md:grid-cols-2" data-testid="compare">
          <figure className="grid gap-2">
            <NativeArcs places={places} centre={places.length - 1} />
            <figcaption style={{ color: "var(--muted)" }}>cobe&apos;s own arcs (arcHeight 0.25), centred on the last place</figcaption>
          </figure>
          <figure className="grid gap-2">
            <NativeArcs places={places} centre={1} />
            <figcaption style={{ color: "var(--muted)" }}>cobe&apos;s own arcs (arcHeight 0.25), centred on the second place</figcaption>
          </figure>
        </div>
      ) : null}

      <p data-testid="sent">{sent}</p>
      <pre data-testid="results" className="max-h-[60vh] overflow-auto whitespace-pre-wrap">
        {json}
      </pre>
    </section>
  );
}
