"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- a measuring harness kept as it ran for its evidence; T-40 replaces it (D-037) */

import { type PointerEvent, useEffect, useId, useRef, useState } from "react";
import { type ClipName, clipUrl, ENGINE_CLIPS, isClipName } from "@/app/_dev/fixtures";
import { round } from "@/app/_dev/harness";
import { postDevReport } from "@/app/_dev/report";
import { needsSilentHint } from "@/features/sound/domain/platform";
import {
  angleFor,
  type Dial,
  dialFor,
  type FuelType,
  needleTarget,
  REST,
  smooth,
  topFor,
} from "@/features/sound/domain/tach";
import { audioSession, EnginePlayer, type PlayerEvent, type PlayerMode } from "@/features/sound/ui/player";

// Spike T-07: a tap-to-play engine clip with the tachometer needle on the analyser (FR-15, BR-19,
// DESIGN §5.3). T-40 builds the card on what it finds. Query:
// - clip (a name in ENGINE_CLIPS), mode (buffer, element), session=playback and fuel
//   (gasoline, diesel) choose a setup;
// - run=1 to 6 takes the setup from RUNS instead, for the phone session. After the clip, the page
//   asks whether you heard it, then opens the next run as a fresh page, so no run inherits an
//   audio session from the last;
// - report=1 also sends each result to the Mac running the server (BUILD-PLAN §4);
// - probe=autoplay creates a context on load, with no gesture, and records its state. That shows
//   whether the browser enforces its autoplay policy, which the desktop checks rely on.

type Run = { switchOn: boolean; mode: PlayerMode; session: "playback" | null };

// The phone session's runs: each way in with the silent switch off, then on
const RUNS: Run[] = [
  { switchOn: false, mode: "buffer", session: null },
  { switchOn: false, mode: "buffer", session: "playback" },
  { switchOn: false, mode: "element", session: null },
  { switchOn: true, mode: "buffer", session: null },
  { switchOn: true, mode: "buffer", session: "playback" },
  { switchOn: true, mode: "element", session: null },
];

type Locale = "ar" | "en";
type Setup = {
  locale: Locale;
  clip: ClipName;
  fuel: FuelType;
  mode: PlayerMode;
  session: "playback" | null;
  run: number | null;
  report: boolean;
  probe: boolean;
};

// From the DESIGN §9.2 copy deck: sound.play, sound.pause, sound.needleNote and sound.silentHint
const COPY = {
  en: {
    play: "Play the engine sound",
    pause: "Pause",
    needleNote: "The needle follows the recording's loudness, not the real rpm.",
    silentHint: "No sound? Turn off silent mode",
  },
  ar: {
    play: "تشغيل صوت المحرك",
    pause: "إيقاف مؤقت",
    needleNote: "يتبع المؤشر شدة صوت التسجيل، وليس عدد الدورات الفعلي.",
    silentHint: "لا يوجد صوت؟ يُرجى إيقاف الوضع الصامت",
  },
} as const;

// Above this level the analyser is hearing the clip
const SOUND_DB = -60;
const FRAME_MS = 1000 / 60;

type Results = {
  kind: "t07-sound";
  page: string;
  loadedAt: string;
  setup: Omit<Setup, "locale" | "report" | "probe"> & { clipType: string; switchOn: boolean | null };
  answer: "heard" | "silent" | null;
  environment: {
    userAgent: string;
    maxTouchPoints: number;
    silentHint: boolean;
    reducedMotion: boolean;
    audioSession: { present: boolean; typeAtLoad: string | null; typeAtEnd: string | null };
    autoplayProbe: { created: string; after300ms: string } | null;
  };
  context: { sampleRate: number; baseLatency: number | null; outputLatency: number | null } | null;
  timings: {
    clickToRunning: number | null;
    clickToPlaying: number | null;
    clickToFirstSound: number | null;
    clickToEnded: number | null;
  };
  events: Array<{ t: number; type: string; detail?: string }>;
  levels: { floorDb: number; ceilDb: number } | null;
  frames: { count: number; medianMs: number | null; fps: number | null };
  playhead: { furthest: number; duration: number | null };
  needle: { min: number; median: number; max: number } | null;
  /** One row per frame: ms since the tap, clip time in ms, analyser level in dB, needle in ×1000 rpm */
  trace: Array<[number, number, number, number]>;
  errors: string[];
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function setupFromUrl(): Setup {
  const params = new URLSearchParams(window.location.search);
  const locale: Locale = window.location.pathname.split("/")[1] === "ar" ? "ar" : "en";
  const runNumber = Number(params.get("run"));
  const run = Number.isInteger(runNumber) && runNumber >= 1 && runNumber <= RUNS.length ? runNumber : null;
  const fixed = run === null ? null : RUNS[run - 1];
  const clip = params.get("clip");
  return {
    locale,
    clip: isClipName(clip) ? clip : "steps-8s",
    fuel: params.get("fuel") === "diesel" ? "diesel" : "gasoline",
    mode: fixed?.mode ?? (params.get("mode") === "element" ? "element" : "buffer"),
    session: fixed ? fixed.session : params.get("session") === "playback" ? "playback" : null,
    run,
    report: params.get("report") === "1",
    probe: params.get("probe") === "autoplay",
  };
}

function nextRunUrl(run: number): string {
  const url = new URL(window.location.href);
  url.searchParams.set("run", String(run + 1));
  return url.pathname + url.search;
}

function DialFace({ dial }: { dial: Dial }) {
  const hatch = `hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const center = 120;
  const radius = 100;
  const point = (value: number, r: number) => {
    const angle = (angleFor(value, dial) * Math.PI) / 180;
    return { x: round(center + r * Math.sin(angle), 2), y: round(center - r * Math.cos(angle), 2) };
  };
  const large = (from: number, to: number) => (angleFor(to, dial) - angleFor(from, dial) > 180 ? 1 : 0);
  const start = point(0, radius);
  const end = point(dial.max, radius);
  const outerFrom = point(dial.redline, radius);
  const innerFrom = point(dial.redline, radius - 10);
  const innerTo = point(dial.max, radius - 10);
  const ticks: Array<{ value: number; major: boolean }> = [];
  for (let value = 0; value <= dial.max; value += 0.5) ticks.push({ value, major: Number.isInteger(value) });
  return (
    <svg className="absolute inset-0 size-full" viewBox="0 0 240 240" aria-hidden="true">
      <defs>
        <pattern id={hatch} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="4" className="stroke-(--fail) [stroke-width:1.5]" />
        </pattern>
      </defs>
      <path
        className="fill-none stroke-(--line) [stroke-width:1]"
        d={`M ${start.x} ${start.y} A ${radius} ${radius} 0 ${large(0, dial.max)} 1 ${end.x} ${end.y}`}
      />
      <path
        className="stroke-(--fail) [stroke-width:1]"
        fill={`url(#${hatch})`}
        d={`M ${outerFrom.x} ${outerFrom.y} A ${radius} ${radius} 0 ${large(dial.redline, dial.max)} 1 ${end.x} ${end.y} L ${innerTo.x} ${innerTo.y} A ${radius - 10} ${radius - 10} 0 ${large(dial.redline, dial.max)} 0 ${innerFrom.x} ${innerFrom.y} Z`}
      />
      {ticks.map(({ value, major }) => {
        const outer = point(value, radius);
        const inner = point(value, radius - (major ? 10 : 5));
        return (
          <line
            key={value}
            className="stroke-(--line)"
            x1={outer.x}
            y1={outer.y}
            x2={inner.x}
            y2={inner.y}
            strokeWidth={major ? 1.5 : 1}
          />
        );
      })}
      {ticks
        .filter(({ major }) => major)
        .map(({ value }) => {
          const at = point(value, radius - 24);
          return (
            <text
              key={value}
              className="fill-(--ink) text-[13px]"
              x={at.x}
              y={at.y}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {value}
            </text>
          );
        })}
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <path d="M9 6 L22 14 L9 22 Z" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <path d="M10 7 V21 M18 7 V21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

const pressed = (event: PointerEvent<HTMLButtonElement>) => {
  event.currentTarget.dataset.pressed = "";
};
const released = (event: PointerEvent<HTMLButtonElement>) => {
  delete event.currentTarget.dataset.pressed;
};

export function SoundSpike() {
  const needleRef = useRef<SVGSVGElement>(null);
  const timeRef = useRef<HTMLTimeElement>(null);
  const setupRef = useRef<Setup | null>(null);
  const playerRef = useRef<EnginePlayer | null>(null);
  const resultsRef = useRef<Results | null>(null);
  // Asks the run's question if the clip never ends. An error doesn't end it, so it keeps the timer.
  const askTimerRef = useRef<number | undefined>(undefined);
  const loopRef = useRef<{
    clickAt: number;
    frame: number;
    last: number | null;
    value: number;
    intervals: number[];
    needles: number[];
  }>({
    clickAt: 0,
    frame: 0,
    last: null,
    value: REST,
    intervals: [],
    needles: [],
  });
  const [setup, setSetup] = useState<Setup | null>(null);
  const [hint, setHint] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [phase, setPhase] = useState<"ready" | "playing" | "paused" | "ended" | "answered">("ready");
  const [asking, setAsking] = useState(false);
  const [json, setJson] = useState("");
  const [sent, setSent] = useState("");

  const dial = dialFor(setup?.fuel ?? "gasoline") ?? { max: 8, redline: 6.5 };
  const copy = COPY[setup?.locale ?? "en"];

  // Back to rest over --dur-pop with --ease-out, on pause and at the end (DESIGN §5.3)
  const settle = () => {
    const needle = needleRef.current;
    loopRef.current.value = REST;
    if (!needle) return;
    needle.dataset.settling = "";
    needle.style.transform = `rotate(${angleFor(REST, dial)}deg)`;
  };

  /** Shows the results, and with `post` sends them to the Mac. False when sending failed. */
  const publish = async (post: boolean): Promise<boolean> => {
    const results = resultsRef.current;
    const current = setupRef.current;
    if (!results || !current) return false;
    const loop = loopRef.current;
    const medianMs = median(loop.intervals);
    results.frames = {
      count: loop.intervals.length,
      medianMs: medianMs === null ? null : round(medianMs, 2),
      fps: medianMs ? round(1000 / medianMs, 1) : null,
    };
    const needles = [...loop.needles].sort((a, b) => a - b);
    results.needle = needles.length
      ? { min: round(needles[0] ?? 0, 3), median: round(median(needles) ?? 0, 3), max: round(needles.at(-1) ?? 0, 3) }
      : null;
    results.environment.audioSession.typeAtEnd = audioSession()?.type ?? null;
    setJson(JSON.stringify(results, null, 2));
    if (!post || !current.report) return true;
    const outcome = await postDevReport(current.locale, results);
    setSent(outcome.message);
    return outcome.ok;
  };

  const tick = (now: number) => {
    const player = playerRef.current;
    const results = resultsRef.current;
    const needle = needleRef.current;
    const loop = loopRef.current;
    if (!player || !results) return;
    const elapsed = loop.last === null ? FRAME_MS : now - loop.last;
    loop.last = now;
    const level = player.levelDb();
    const clipTime = player.currentTime;
    if (player.playing) {
      loop.intervals.push(elapsed);
      if (results.timings.clickToFirstSound === null && level > SOUND_DB)
        results.timings.clickToFirstSound = round(now - loop.clickAt, 0);
      results.playhead.furthest = Math.max(results.playhead.furthest, round(clipTime, 3));
      const levels = player.levels;
      if (levels && !results.environment.reducedMotion && needle) {
        const top = topFor(ENGINE_CLIPS[setupRef.current?.clip ?? "steps-8s"].clipType, dial);
        loop.value = smooth(loop.value, needleTarget(level, levels, top), elapsed);
        needle.style.transform = `rotate(${angleFor(loop.value, dial)}deg)`;
        loop.needles.push(loop.value);
      }
      results.trace.push([
        round(now - loop.clickAt, 0),
        round(clipTime * 1000, 0),
        round(level, 1),
        round(loop.value, 3),
      ]);
      if (timeRef.current) timeRef.current.textContent = `${clock(clipTime)} / ${clock(player.duration ?? 0)}`;
      loop.frame = requestAnimationFrame(tick);
    }
  };

  const stopAskTimer = () => {
    window.clearTimeout(askTimerRef.current);
    askTimerRef.current = undefined;
  };

  const onEvent = (event: PlayerEvent) => {
    const results = resultsRef.current;
    const player = playerRef.current;
    if (!results) return;
    const t = round(event.at - loopRef.current.clickAt, 0);
    results.events.push({ t, type: event.type, ...(event.detail === undefined ? {} : { detail: event.detail }) });
    if (event.type === "context" && event.detail === "running" && results.timings.clickToRunning === null)
      results.timings.clickToRunning = t;
    if (event.type === "playing" && results.timings.clickToPlaying === null) results.timings.clickToPlaying = t;
    if (event.type === "decoded" && player?.levels) {
      results.levels = { floorDb: round(player.levels.floorDb, 2), ceilDb: round(player.levels.ceilDb, 2) };
    }
    if (event.type === "error") results.errors.push(event.detail ?? "error");
    if (event.type === "ended" || event.type === "paused" || event.type === "error") {
      cancelAnimationFrame(loopRef.current.frame);
      settle();
      setPlaying(false);
    }
    if (event.type === "ended") {
      results.timings.clickToEnded ??= t;
      results.playhead.duration = player?.duration ?? null;
      setPhase("ended");
      stopAskTimer();
      if (setupRef.current?.run !== null) setAsking(true);
      void publish(setupRef.current?.run === null);
    }
    if (event.type === "paused") {
      setPhase("paused");
      void publish(false);
    }
  };

  useEffect(() => {
    const current = setupFromUrl();
    setupRef.current = current;
    setSetup(current);
    const silentHint = needsSilentHint(navigator.userAgent, navigator.maxTouchPoints);
    setHint(silentHint);
    const fixed = current.run === null ? null : RUNS[current.run - 1];
    resultsRef.current = {
      kind: "t07-sound",
      page: window.location.pathname + window.location.search,
      loadedAt: new Date().toISOString(),
      setup: {
        clip: current.clip,
        clipType: ENGINE_CLIPS[current.clip].clipType,
        fuel: current.fuel,
        mode: current.mode,
        session: current.session,
        run: current.run,
        switchOn: fixed?.switchOn ?? null,
      },
      answer: null,
      environment: {
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints,
        silentHint,
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        audioSession: {
          present: audioSession() !== undefined,
          typeAtLoad: audioSession()?.type ?? null,
          typeAtEnd: null,
        },
        autoplayProbe: null,
      },
      context: null,
      timings: { clickToRunning: null, clickToPlaying: null, clickToFirstSound: null, clickToEnded: null },
      events: [],
      levels: null,
      frames: { count: 0, medianMs: null, fps: null },
      playhead: { furthest: 0, duration: null },
      needle: null,
      trace: [],
      errors: [],
    };
    const player = new EnginePlayer({
      url: clipUrl(current.locale, current.clip, current.run),
      mode: current.mode,
      sessionType: current.session ?? undefined,
      onEvent,
    });
    playerRef.current = player;
    let probe: AudioContext | null = null;
    if (current.probe) {
      probe = new AudioContext();
      const created = probe.state;
      const context = probe;
      setTimeout(() => {
        const results = resultsRef.current;
        if (results) results.environment.autoplayProbe = { created, after300ms: context.state };
        void context.close();
        void publish(false);
      }, 300);
    }
    void publish(false);
    return () => {
      stopAskTimer();
      cancelAnimationFrame(loopRef.current.frame);
      player.dispose();
      void probe?.close();
    };
    // The page sets up once: the setup comes from the URL, and each run is a fresh page
  }, []);

  const onPlay = () => {
    const player = playerRef.current;
    const results = resultsRef.current;
    if (!player || !results) return;
    if (player.playing) {
      player.pause();
      return;
    }
    const loop = loopRef.current;
    if (phase === "ready") loop.clickAt = performance.now();
    // Everything up to here, and play() up to its first await, runs inside the tap (FR-15.2)
    void player.play();
    const context = player.context;
    if (context && results.context === null) {
      results.context = {
        sampleRate: context.sampleRate,
        baseLatency: "baseLatency" in context ? round(context.baseLatency * 1000, 2) : null,
        outputLatency: "outputLatency" in context ? round(context.outputLatency * 1000, 2) : null,
      };
    }
    if (needleRef.current) delete needleRef.current.dataset.settling;
    loop.last = null;
    cancelAnimationFrame(loop.frame);
    loop.frame = requestAnimationFrame(tick);
    setPlaying(true);
    setPhase("playing");
    // If nothing ever ends, ask anyway
    if (setupRef.current?.run !== null) {
      stopAskTimer();
      askTimerRef.current = window.setTimeout(
        () => setAsking(true),
        (ENGINE_CLIPS[setupRef.current?.clip ?? "steps-8s"].seconds + 4) * 1000,
      );
    }
  };

  const answer = async (heard: boolean) => {
    const results = resultsRef.current;
    const current = setupRef.current;
    if (!results || !current || current.run === null) return;
    stopAskTimer();
    results.answer = heard ? "heard" : "silent";
    setAsking(false);
    setPhase("answered");
    // A run whose report didn't reach the Mac stays open, so the answer can be sent again
    if (!(await publish(true))) {
      setPhase("ended");
      setAsking(true);
      return;
    }
    if (current.run < RUNS.length) window.location.assign(nextRunUrl(current.run));
  };

  const prefetch = () => playerRef.current?.prefetch();
  const run = setup?.run ?? null;
  const fixed = run === null ? null : RUNS[run - 1];

  return (
    <section
      className="grid gap-4 bg-(--bg) p-4 text-(--ink) [--bg:#0b0d10] [--dur-pop:200ms] [--dur-press:120ms] [--ease-out:cubic-bezier(0.23,1,0.32,1)] [--fail:#e87470] [--ink:#eef2f6] [--line:#66778e] [--scan:#5cc8db]"
      data-state={phase}
    >
      {fixed && run !== null ? (
        <div className="grid gap-2 border border-(--line) p-3">
          <p>
            Run {run} of {RUNS.length}: {fixed.mode === "element" ? "<audio> element" : "decoded buffer"}
            {fixed.session ? `, audio session "${fixed.session}"` : ""}
          </p>
          <p className="text-xl">Silent mode {fixed.switchOn ? "ON" : "OFF"}</p>
          <p className="text-[0.8rem] text-(--line)">
            Use the side switch, or the Action button on newer iPhones. Volume at least halfway. Tap play once and
            listen to the end.
          </p>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-6">
        <div className="relative aspect-square w-[min(100%,280px)]" dir="ltr" data-dial>
          <DialFace dial={dial} />
          <svg
            ref={needleRef}
            className="pointer-events-none absolute inset-0 size-full [transform:rotate(-120deg)] data-settling:[transition:transform_var(--dur-pop)_var(--ease-out)] motion-reduce:data-settling:[transition:none]"
            viewBox="0 0 240 240"
            aria-hidden="true"
            data-needle
          >
            <line
              className="stroke-(--ink) [stroke-linecap:round] [stroke-width:2.5]"
              x1="120"
              y1="120"
              x2="120"
              y2="34"
            />
            <circle className="fill-(--scan)" cx="120" cy="120" r="6" />
          </svg>
        </div>
        <div className="grid justify-items-start gap-2">
          <button
            type="button"
            className="grid size-[72px] place-items-center rounded-full border-[1.5px] border-(--ink) bg-transparent text-(--ink) [transition:scale_var(--dur-press)_ease-out] hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--scan) data-pressed:scale-[0.97]"
            data-play
            aria-label={playing ? copy.pause : copy.play}
            onClick={onPlay}
            onPointerEnter={prefetch}
            onFocus={prefetch}
            onPointerDown={pressed}
            onPointerUp={released}
            onPointerCancel={released}
            onPointerLeave={released}
            disabled={setup === null || phase === "answered"}
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          {hint ? (
            <p className="text-[0.8rem] text-(--line)" data-hint>
              {copy.silentHint}
            </p>
          ) : null}
          <time ref={timeRef} className="text-[0.8rem] text-(--line)" dir="ltr">
            0:00 / {clock(ENGINE_CLIPS[setup?.clip ?? "steps-8s"].seconds)}
          </time>
        </div>
      </div>
      <p className="text-[0.8rem] text-(--line)">{copy.needleNote}</p>
      {asking ? (
        <div className="grid gap-2 border border-(--line) p-3">
          <p>Did you hear the engine?</p>
          <div className="flex gap-3">
            <button
              type="button"
              className="border border-(--ink) bg-transparent px-4 py-3 text-(--ink)"
              onClick={() => void answer(true)}
            >
              Heard it
            </button>
            <button
              type="button"
              className="border border-(--ink) bg-transparent px-4 py-3 text-(--ink)"
              onClick={() => void answer(false)}
            >
              Didn&apos;t hear it
            </button>
          </div>
        </div>
      ) : null}
      {phase === "answered" && run === RUNS.length ? <p>All {RUNS.length} runs are done.</p> : null}
      <p className="text-[0.8rem] text-(--line)">{sent}</p>
      <pre className="max-h-96 overflow-auto text-[0.7rem] break-all whitespace-pre-wrap" data-results>
        {json}
      </pre>
    </section>
  );
}
