"use client";
/* eslint-disable react-hooks/refs -- a measuring harness kept as it ran for its evidence; T-49 replaces it (D-037) */

import { useEffect, useRef, useState } from "react";
import { describeError, round, watchViolations } from "@/app/_dev/harness";
import { postDevReport } from "@/app/_dev/report";
import { scanRegion, VIN_FORMATS } from "@/features/vin/domain/barcode";
import {
  closeCamera,
  createScanner,
  hasCamera,
  openCamera,
  type ScanEngine,
  type Scanned,
  scanPhoto,
  type ScanRead,
  scanVideo,
  type VinScanner,
} from "@/features/vin/ui/scanner";
import { ZXING_WASM_PATH } from "@/features/vin/ui/zxing";
import { checkVin, normalizeVin } from "@/lib/validation/vin";

// Spike T-10 (FR-36.2): can this browser read a VIN barcode with its camera, and with what? The
// page offers "Scan VIN" where there is a camera, reads frames with the browser's own detector or
// the zxing-wasm polyfill, and fills the field for confirmation. "Read a photo" takes the
// camera-less way in. The test codes are at ./codes. Results appear below as JSON.
//
// Query: engine=polyfill uses the polyfill even where the browser has its own detector; width=3840
// asks the camera for a wider picture than 1920; report=1 sends the results to the Mac running the
// server after each scan or photo (BUILD-PLAN §4).

type Setup = { locale: "ar" | "en"; polyfill: boolean; width: number; report: boolean };

const WIDTHS = [1280, 1920, 2560, 3840];

type Summary = { median: number; p95: number; max: number };

type Scan = {
  engine: ScanEngine | null;
  /** From the tap: the camera granted, its first frame shown, the detector made, the VIN found */
  ms: { camera: number | null; firstFrame: number | null; detector: number | null; found: number | null };
  settings: Record<string, unknown> | null;
  capabilities: Record<string, unknown> | null;
  video: { width: number; height: number } | null;
  /** The first read waits for the polyfill's .wasm, so it is kept apart */
  reads: { count: number; size: string | null; firstMs: number | null; ms: Summary | null };
  seen: Array<{ format: string; text: string; kept: boolean }>;
  result: Scanned | null;
  end: "found" | "stopped" | "hidden" | "failed" | null;
  error: string | null;
};

type Photo = {
  name: string;
  type: string;
  bytes: number;
  engine: ScanEngine | null;
  ms: number | null;
  codes: Array<{ format: string; text: string }>;
  result: Scanned | null;
  error: string | null;
};

type Results = {
  kind: "t10-vin";
  userAgent: string;
  setup: Omit<Setup, "report">;
  formats: readonly string[];
  native: { present: boolean; formats: string[] | null };
  camera: boolean | null;
  scans: Scan[];
  photos: Photo[];
  /** Every resource this page loaded from another origin: a CDN request would show here */
  otherOrigins: string[];
  /** The .wasm's own request, if the polyfill ran */
  wasm: { url: string; transferSize: number; decodedBodySize: number; ms: number } | null;
  csp: string[];
  errors: string[];
};

type Phase = "probing" | "ready" | "opening" | "scanning" | "reading";

function summarize(values: number[]): Summary | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return { median: round(at(0.5)), p95: round(at(0.95)), max: round(sorted.at(-1) ?? 0) };
}

function setupFromUrl(): Setup {
  const params = new URLSearchParams(window.location.search);
  return {
    locale: window.location.pathname.split("/")[1] === "ar" ? "ar" : "en",
    polyfill: params.get("engine") === "polyfill",
    width: WIDTHS.find((width) => String(width) === params.get("width")) ?? 1920,
    report: params.get("report") === "1",
  };
}

// What the report keeps of the camera track: no device ids or labels
const SETTINGS = ["width", "height", "frameRate", "facingMode", "aspectRatio", "resizeMode"];
const CAPABILITIES = ["width", "height", "frameRate", "facingMode", "focusMode", "torch", "zoom"];

function pick(source: object | undefined, keys: string[]): Record<string, unknown> | null {
  if (!source) return null;
  return Object.fromEntries(Object.entries(source).filter(([key]) => keys.includes(key)));
}

export function VinSpike() {
  const [phase, setPhase] = useState<Phase>("probing");
  const [vin, setVin] = useState("");
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);
  const [live, setLive] = useState("");
  const [filled, setFilled] = useState("");
  const [sent, setSent] = useState("");
  const [json, setJson] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const setupRef = useRef<Setup | null>(null);
  const resultsRef = useRef<Results | null>(null);
  const scannerRef = useRef<Promise<VinScanner> | null>(null);
  const abortRef = useRef<{ controller: AbortController; end: Scan["end"] } | null>(null);

  const show = () => setJson(JSON.stringify(resultsRef.current, null, 2));

  // One detector for the page, made again only after a failure. Making the polyfill's starts loading its .wasm.
  const scanner = () => {
    scannerRef.current ??= createScanner({ polyfill: setupRef.current?.polyfill ?? false }).catch((error: unknown) => {
      scannerRef.current = null;
      throw error;
    });
    return scannerRef.current;
  };

  /** With report=1, sends the results to the Mac */
  const report = async () => {
    const results = resultsRef.current;
    const setup = setupRef.current;
    if (!results || !setup) return;
    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    results.otherOrigins = resources
      .filter((entry) => new URL(entry.name).origin !== window.location.origin)
      .map((entry) => entry.name);
    const wasm = resources.find((entry) => new URL(entry.name).pathname === ZXING_WASM_PATH);
    results.wasm = wasm
      ? {
          url: wasm.name,
          transferSize: wasm.transferSize,
          decodedBodySize: wasm.decodedBodySize,
          ms: round(wasm.duration),
        }
      : null;
    show();
    if (!setup.report) return;
    setSent((await postDevReport(setup.locale, results)).message);
  };

  const fill = (found: Scanned) => {
    setVin(found.vin);
    setFilled(`Filled from ${found.format}: ${found.text}${found.warning ? ` (${found.warning})` : ""}`);
  };

  const scan = async () => {
    const results = resultsRef.current;
    const video = videoRef.current;
    if (!results || !video || abortRef.current) return;
    const tapped = performance.now();
    const since = () => round(performance.now() - tapped);
    const record: Scan = {
      engine: null,
      ms: { camera: null, firstFrame: null, detector: null, found: null },
      settings: null,
      capabilities: null,
      video: null,
      reads: { count: 0, size: null, firstMs: null, ms: null },
      seen: [],
      result: null,
      end: null,
      error: null,
    };
    results.scans.push(record);
    const stop = { controller: new AbortController(), end: null as Scan["end"] };
    abortRef.current = stop;
    setFilled("");
    setPhase("opening");
    let stream: MediaStream | null = null;
    try {
      // The detector loads while the browser asks for the camera
      const detector = scanner();
      stream = await openCamera({ width: setupRef.current?.width ?? 1920 });
      record.ms.camera = since();
      const track = stream.getVideoTracks()[0];
      record.settings = pick(track?.getSettings(), SETTINGS);
      record.capabilities = pick(track?.getCapabilities?.(), CAPABILITIES);
      if (stop.controller.signal.aborted) return;
      video.srcObject = stream;
      // Turning the phone turns the picture, and the band on screen follows it
      video.onresize = () => setFrame({ width: video.videoWidth, height: video.videoHeight });
      await video.play();
      record.video = { width: video.videoWidth, height: video.videoHeight };
      record.ms.firstFrame = since();
      setFrame(record.video);
      const ready = await detector;
      record.engine = ready.engine;
      record.ms.detector = since();
      setPhase("scanning");
      const times: number[] = [];
      let shown = 0;
      const onRead = (read: ScanRead) => {
        if (record.reads.firstMs === null) record.reads.firstMs = round(read.ms);
        else times.push(read.ms);
        record.reads.count += 1;
        record.reads.size = `${read.width}x${read.height}`;
        for (const code of read.codes) {
          if (!record.seen.some((seen) => seen.format === code.format && seen.text === code.rawValue)) {
            record.seen.push({ format: code.format, text: code.rawValue, kept: false });
          }
        }
        if (performance.now() - shown > 250) {
          shown = performance.now();
          setLive(
            `${record.reads.count} reads, last ${round(read.ms)} ms, ${record.reads.size}${record.seen.length ? `, seen ${record.seen.map((seen) => seen.text).join(", ")}` : ""}`,
          );
        }
      };
      const found = await scanVideo(video, ready, { signal: stop.controller.signal, onRead });
      record.reads.ms = summarize(times);
      if (found) {
        record.ms.found = since();
        record.result = found;
        record.end = "found";
        const seen = record.seen.find((entry) => entry.format === found.format && entry.text === found.text);
        if (seen) seen.kept = true;
        fill(found);
      } else {
        record.end = stop.end ?? "stopped";
      }
    } catch (error) {
      record.end = "failed";
      record.error = describeError(error);
      setFilled(`Scanning failed: ${record.error}. Type the VIN instead.`);
    } finally {
      if (record.end === null) record.end = stop.end ?? "stopped";
      closeCamera(stream);
      video.onresize = null;
      video.srcObject = null;
      abortRef.current = null;
      setPhase("ready");
      setLive("");
      void report();
    }
  };

  const stopScan = (end: Scan["end"]) => {
    const stop = abortRef.current;
    if (!stop) return;
    stop.end = end;
    stop.controller.abort();
  };

  const readPhoto = async (file: File) => {
    const results = resultsRef.current;
    if (!results) return;
    const record: Photo = {
      name: file.name,
      type: file.type,
      bytes: file.size,
      engine: null,
      ms: null,
      codes: [],
      result: null,
      error: null,
    };
    results.photos.push(record);
    setPhase("reading");
    setFilled("");
    try {
      const ready = await scanner();
      record.engine = ready.engine;
      const started = performance.now();
      const { found, codes } = await scanPhoto(file, ready);
      record.ms = round(performance.now() - started);
      record.codes = codes.map((code) => ({ format: code.format, text: code.rawValue }));
      record.result = found;
      if (found) fill(found);
      else setFilled(codes.length ? "No VIN in this photo's barcodes" : "No barcode found in this photo");
    } catch (error) {
      record.error = describeError(error);
      setFilled(`Reading failed: ${record.error}`);
    } finally {
      setPhase("ready");
      void report();
    }
  };

  useEffect(() => {
    const setup = setupFromUrl();
    setupRef.current = setup;
    const Native = (globalThis as { BarcodeDetector?: { getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
    const results: Results = {
      kind: "t10-vin",
      userAgent: navigator.userAgent,
      setup: { locale: setup.locale, polyfill: setup.polyfill, width: setup.width },
      formats: VIN_FORMATS,
      native: { present: Boolean(Native), formats: null },
      camera: null,
      scans: [],
      photos: [],
      otherOrigins: [],
      wasm: null,
      csp: [],
      errors: [],
    };
    resultsRef.current = results;
    const stopWatching = watchViolations((line) => {
      results.csp.push(line);
      show();
    });
    // The camera is released whenever the page is hidden (as FR-38.8 asks of guided capture)
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stopScan("hidden");
    };
    document.addEventListener("visibilitychange", onVisibility);
    let live = true;
    void (async () => {
      // A detector that can't list its formats leaves the polyfill to scan, so the camera is still offered
      try {
        results.native.formats = Native ? await Native.getSupportedFormats() : null;
      } catch (error) {
        results.errors.push(describeError(error));
      }
      results.camera = await hasCamera();
      if (!live) return;
      setPhase("ready");
      show();
    })();
    return () => {
      live = false;
      stopWatching();
      document.removeEventListener("visibilitychange", onVisibility);
      stopScan("stopped");
    };
    // The page sets up once: the setup comes from the URL, and a new setup is a fresh page
  }, []);

  const results = resultsRef.current;
  const check = vin ? checkVin(normalizeVin(vin)) : null;
  const cameraOn = phase === "opening" || phase === "scanning";
  const band = frame ? scanRegion(frame.width, frame.height) : null;

  return (
    <section className="grid max-w-2xl gap-3" data-state={phase}>
      <p>
        {results?.native.present
          ? `This browser has its own detector (${results.native.formats?.join(", ") ?? "formats unknown"})`
          : "This browser has no detector of its own"}
        {results?.setup.polyfill ? "; using the polyfill (engine=polyfill)" : ""}
        {results ? `; camera asked for ${results.setup.width} pixels across` : ""}
      </p>
      <label className="grid gap-1">
        <span>VIN</span>
        <input
          className="border border-(--ink) px-3 py-2 uppercase"
          dir="ltr"
          value={vin}
          onChange={(event) => setVin(event.target.value.toUpperCase())}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          data-vin
        />
        <span data-check={check === null ? "empty" : check.ok ? (check.warning ? "warning" : "valid") : "error"}>
          {check === null ? " " : check.ok ? (check.warning ?? "valid") : check.error}
        </span>
      </label>
      <div className="flex flex-wrap gap-3">
        {results?.camera ? (
          cameraOn ? (
            <button
              type="button"
              className="border border-(--ink) px-4 py-3"
              onClick={() => stopScan("stopped")}
              data-stop
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="border border-(--ink) px-4 py-3"
              disabled={phase !== "ready"}
              onClick={() => void scan()}
              data-scan
            >
              Scan VIN
            </button>
          )
        ) : null}
        <label className="border border-(--ink) px-4 py-3">
          Read a photo
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={phase !== "ready"}
            data-photo
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void readPhoto(file);
            }}
          />
        </label>
      </div>
      <p>{results?.camera === false ? "No camera here, so Scan VIN is not offered." : ""}</p>
      <div
        className={cameraOn ? "relative overflow-hidden bg-black" : "hidden"}
        style={
          frame
            ? {
                aspectRatio: `${frame.width} / ${frame.height}`,
                width: `min(100%, calc(60svh * ${frame.width} / ${frame.height}))`,
              }
            : { aspectRatio: "16 / 9", width: "100%" }
        }
      >
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          muted
          playsInline
          autoPlay
          data-video
        />
        {frame && band ? (
          <div
            className="absolute border-2 border-white"
            style={{
              left: `${(band.x / frame.width) * 100}%`,
              top: `${(band.y / frame.height) * 100}%`,
              width: `${(band.width / frame.width) * 100}%`,
              height: `${(band.height / frame.height) * 100}%`,
            }}
          />
        ) : null}
      </div>
      <p data-live>{phase === "opening" ? "Opening the camera..." : live}</p>
      <p data-filled>{filled}</p>
      <p>
        <a className="underline" href={`/${results?.setup.locale ?? "en"}/dealer/dev/vin/codes`}>
          Test codes to scan
        </a>
      </p>
      <p className="text-[0.8rem]">{sent}</p>
      <pre className="max-h-96 overflow-auto text-[0.7rem] break-all whitespace-pre-wrap" data-results>
        {json}
      </pre>
    </section>
  );
}
