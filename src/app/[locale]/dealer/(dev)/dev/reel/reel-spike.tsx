"use client";
/* eslint-disable react-hooks/refs, react-hooks/purity, react-hooks/exhaustive-deps -- a measuring harness kept as it ran for its evidence; T-66 replaces it (D-037) */

import { useEffect, useRef, useState } from "react";
import { type ClipName, clipUrl, isClipName } from "@/app/_dev/fixtures";
import { describeError, round, watchViolations } from "@/app/_dev/harness";
import { postDevMp4, postDevReport } from "@/app/_dev/report";
import type { ReelPcm } from "@/features/reel/domain/clip";
import {
  type AudioChoice,
  AUDIO_CONFIGS,
  type BitrateMode,
  isSupported,
  pickAudioConfig,
  pickVideoCodec,
  REEL,
  VIDEO_CODECS,
  videoConfig,
} from "@/features/reel/domain/support";
import { prepareClip } from "@/features/reel/ui/prepare-clip";
import type { EncodeStats, ReelAudio } from "@/features/reel/worker/encode";
import { PATTERN } from "./pattern";
import type { WorkerProbe, WorkerReply, WorkerRequest } from "./reel.worker";

// Spike T-08 (FR-43): can this browser draw frames in a worker and encode them, with the engine
// clip, into an MP4 that plays? The page checks support, makes a 15-second test video from the
// pattern in pattern.ts, then plays it muted and reads frames, colours and audio back. Another
// MP4 can be checked the same way with "Check an MP4". Results appear below as JSON.
//
// Query: clip=steps-8s (the default), steps-20s, idle-12s, rev-6s or none (a silent reel);
// mode=constant for constant bitrate; auto=1 starts at once; report=1 sends the results and the
// MP4 to the Mac running the server (BUILD-PLAN §4).

type ClipChoice = ClipName | "none";

type Setup = { locale: "ar" | "en"; clip: ClipChoice; mode: BitrateMode; auto: boolean; report: boolean };

// Probed, never chosen: lower profiles show what the encoder could do instead (BR-39 names High),
// and level 3.1 is too small for 1080 × 1920, so a yes there means the browser doesn't check levels
const OTHER_VIDEO = ["avc1.4d0028", "avc1.42e028", "avc1.42001f"];
const OTHER_AUDIO: AudioEncoderConfig[] = [
  { codec: "mp4a.40.5", sampleRate: 22_050, numberOfChannels: 1, bitrate: 48_000 },
  { codec: "opus", sampleRate: 48_000, numberOfChannels: 2, bitrate: 128_000 },
];
const MESSAGE_UNSUPPORTED = "Reels need Chrome, Edge, Firefox, or Safari 26 or newer";

type Support = {
  features: Record<string, boolean>;
  video: Record<string, boolean>;
  audio: Record<string, boolean>;
  picks: { video: string | null; videoConstant: string | null; audio: AudioChoice | null };
  worker: WorkerProbe | { error: string } | null;
  /** FR-43.1 and SRS §10.8 */
  offered: boolean;
  /** FR-43.3 */
  silent: boolean;
};

type FrameRead = {
  requested: number;
  index: number | null;
  patches: Array<{ name: string; expected: readonly number[]; got: number[]; diff: number }>;
};

type Playback = {
  width: number;
  height: number;
  duration: number;
  playedMs: number;
  frameCallbacks: number | null;
  distinctMediaTimes: number | null;
  lastMediaTime: number | null;
  totalFrames: number | null;
  droppedFrames: number | null;
  audioDecodedBytes: number | null;
  videoDecodedBytes: number | null;
  audioTracks: number | null;
  frames: FrameRead[];
};

type AudioCheck =
  | {
      decoded: true;
      seconds: number;
      sampleRate: number;
      channels: number;
      peakDb: number;
      rmsDbPerHalfSecond: number[];
    }
  | { decoded: false; error: string };

type Checked = { bytes: number; sha256: string; playback: Playback | { error: string }; audio: AudioCheck };

type Results = {
  kind: "t08-reel";
  userAgent: string;
  setup: Omit<Setup, "auto" | "report">;
  pattern: typeof PATTERN;
  support: Support | null;
  encode: {
    pictureMs: number;
    prepareAudioMs: number | null;
    audio: { codec: string; sampleRate: number; numberOfChannels: number; clipSeconds: number } | null;
    drawMs: Summary;
    addMs: Summary;
    finalizeMs: number;
    totalMs: number;
    overCap: boolean;
    video: EncodeStats["video"];
    audioTrack: EncodeStats["audio"];
  } | null;
  output: Checked | null;
  crossPlay: Array<Checked & { name: string }>;
  cancels: Array<{ atFrames: number; replyMs: number }>;
  answer: string | null;
  mp4File: string | null;
  errors: string[];
  csp: string[];
};

type Summary = { median: number; p95: number; max: number; total: number };
type Phase =
  | "probing"
  | "unsupported"
  | "ready"
  | "preparing"
  | "encoding"
  | "cancelling"
  | "checking"
  | "done"
  | "failed"
  | "cancelled";

function summarize(values: number[]): Summary {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return {
    median: round(at(0.5), 2),
    p95: round(at(0.95), 2),
    max: round(sorted.at(-1) ?? 0, 2),
    total: round(values.reduce((a, b) => a + b, 0)),
  };
}

function setupFromUrl(): Setup {
  const params = new URLSearchParams(window.location.search);
  const clip = params.get("clip");
  return {
    locale: window.location.pathname.split("/")[1] === "ar" ? "ar" : "en",
    clip: clip === "none" ? "none" : isClipName(clip) ? clip : "steps-8s",
    mode: params.get("mode") === "constant" ? "constant" : "variable",
    auto: params.get("auto") === "1",
    report: params.get("report") === "1",
  };
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function waitFor(target: HTMLMediaElement, type: string, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error(`no ${type} after ${ms} ms`)), ms);
    const onEvent = () => finish();
    const onError = () => finish(new Error(`media error ${target.error?.code ?? "?"}: ${target.error?.message ?? ""}`));
    function finish(error?: Error) {
      clearTimeout(timer);
      target.removeEventListener(type, onEvent);
      target.removeEventListener("error", onError);
      if (error) reject(error);
      else resolve();
    }
    target.addEventListener(type, onEvent);
    target.addEventListener("error", onError);
  });
}

async function probeSupport(worker: WorkerProbe | { error: string } | null): Promise<Support> {
  const video: Record<string, boolean> = {};
  const videoCheck =
    typeof VideoEncoder === "undefined" ? undefined : VideoEncoder.isConfigSupported.bind(VideoEncoder);
  for (const codec of [...VIDEO_CODECS, ...OTHER_VIDEO]) {
    for (const mode of ["variable", "constant"] as const)
      video[`${codec} ${mode}`] = await isSupported(videoCheck, videoConfig(codec, mode));
  }
  for (const hardwareAcceleration of ["prefer-hardware", "prefer-software"] as const) {
    video[`avc1.640028 ${hardwareAcceleration}`] = await isSupported(videoCheck, {
      ...videoConfig("avc1.640028"),
      hardwareAcceleration,
    });
  }
  video["avc1.640028 landscape 1920x1080"] = await isSupported(videoCheck, {
    ...videoConfig("avc1.640028"),
    width: 1920,
    height: 1080,
  });

  const audio: Record<string, boolean> = {};
  const audioCheck =
    typeof AudioEncoder === "undefined" ? undefined : AudioEncoder.isConfigSupported.bind(AudioEncoder);
  for (const config of [...AUDIO_CONFIGS, ...OTHER_AUDIO]) {
    audio[`${config.codec} ${config.sampleRate} Hz ${config.numberOfChannels} ch`] = await isSupported(
      audioCheck,
      config,
    );
  }

  const picks = {
    video: await pickVideoCodec(),
    videoConstant: await pickVideoCodec(globalThis, "constant"),
    audio: await pickAudioConfig(),
  };
  const workerOk = worker !== null && !("error" in worker) && worker.canvasProblem === null;
  return {
    features: {
      VideoEncoder: typeof VideoEncoder !== "undefined",
      AudioEncoder: typeof AudioEncoder !== "undefined",
      OffscreenCanvas: typeof OffscreenCanvas !== "undefined",
      requestVideoFrameCallback: "requestVideoFrameCallback" in HTMLVideoElement.prototype,
    },
    video,
    audio,
    picks,
    worker,
    offered: picks.video !== null && workerOk,
    silent: picks.audio === null,
  };
}

/** Reads the index strip and the colour patches from the frame on screen */
function readFrame(video: HTMLVideoElement, requested: number): FrameRead {
  const canvas = document.createElement("canvas");
  canvas.width = REEL.width;
  canvas.height = REEL.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { requested, index: null, patches: [] };
  ctx.drawImage(video, 0, 0, REEL.width, REEL.height);
  const mean = (x: number, y: number, size: number) => {
    const data = ctx.getImageData(x, y, size, size).data;
    const sum = [0, 0, 0];
    for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c += 1) sum[c] = (sum[c] ?? 0) + (data[i + c] ?? 0);
    return sum.map((v) => round(v / (data.length / 4), 1));
  };
  const { strip, patches, patch } = PATTERN;
  let index = 0;
  for (let k = 0; k < strip.bits; k += 1) {
    const [r = 0, g = 0, b = 0] = mean(strip.x + k * strip.pitch + 20, strip.y + 20, 40);
    index = index * 2 + ((r + g + b) / 3 > 128 ? 1 : 0);
  }
  return {
    requested,
    index,
    patches: patches.map(({ name, rgb }, k) => {
      const got = mean(patch.x + k * patch.pitch + 30, patch.y + 30, 50);
      return { name, expected: rgb, got, diff: round(Math.max(...got.map((v, c) => Math.abs(v - (rgb[c] ?? 0)))), 1) };
    }),
  };
}

async function seekTo(video: HTMLVideoElement, frame: number): Promise<void> {
  const seeked = waitFor(video, "seeked", 5000);
  video.currentTime = (frame + 0.5) / REEL.fps;
  await seeked;
  // A paused element presents the new frame a little after "seeked" in some engines
  if (typeof video.requestVideoFrameCallback === "function") {
    await Promise.race([
      new Promise<void>((resolve) => video.requestVideoFrameCallback(() => resolve())),
      new Promise((r) => setTimeout(r, 500)),
    ]);
  }
}

async function checkPlayback(video: HTMLVideoElement, url: string): Promise<Playback> {
  // Muted, always: these checks never play sound out loud (the owner listens on purpose instead)
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = "auto";
  const loaded = waitFor(video, "loadedmetadata", 10_000);
  video.src = url;
  await loaded;
  const mediaTimes: number[] = [];
  const counting = typeof video.requestVideoFrameCallback === "function";
  let frameCallback: number | undefined;
  if (counting) {
    const onFrame: VideoFrameRequestCallback = (_now, metadata) => {
      mediaTimes.push(metadata.mediaTime);
      if (!video.ended) frameCallback = video.requestVideoFrameCallback(onFrame);
    };
    frameCallback = video.requestVideoFrameCallback(onFrame);
  }
  const started = performance.now();
  try {
    await video.play();
    // Waits only once playing, so a play() that fails leaves no listener or timer behind
    await waitFor(video, "ended", 45_000);
  } finally {
    // The seeks below show frames too, and must not count as played ones
    if (frameCallback !== undefined) video.cancelVideoFrameCallback(frameCallback);
  }
  const playedMs = round(performance.now() - started);
  const quality = typeof video.getVideoPlaybackQuality === "function" ? video.getVideoPlaybackQuality() : null;
  const extra = video as HTMLVideoElement & {
    webkitAudioDecodedByteCount?: number;
    webkitVideoDecodedByteCount?: number;
    audioTracks?: { length: number };
  };
  const playback: Playback = {
    width: video.videoWidth,
    height: video.videoHeight,
    duration: video.duration,
    playedMs,
    frameCallbacks: counting ? mediaTimes.length : null,
    distinctMediaTimes: counting ? new Set(mediaTimes).size : null,
    lastMediaTime: mediaTimes.at(-1) ?? null,
    totalFrames: quality?.totalVideoFrames ?? null,
    droppedFrames: quality?.droppedVideoFrames ?? null,
    audioDecodedBytes: extra.webkitAudioDecodedByteCount ?? null,
    videoDecodedBytes: extra.webkitVideoDecodedByteCount ?? null,
    audioTracks: extra.audioTracks?.length ?? null,
    frames: [],
  };
  for (const frame of [0, 31, 225, REEL.frames - 1]) {
    await seekTo(video, frame);
    playback.frames.push(readFrame(video, frame));
  }
  return playback;
}

/** Decodes the file's audio offline, so nothing plays out loud */
async function checkAudio(bytes: ArrayBuffer): Promise<AudioCheck> {
  try {
    const buffer = await new OfflineAudioContext(1, 1, 48_000).decodeAudioData(bytes.slice(0));
    const data = buffer.getChannelData(0);
    const rate = buffer.sampleRate;
    let peak = 0;
    for (const v of data) peak = Math.max(peak, Math.abs(v));
    const rmsDbPerHalfSecond: number[] = [];
    for (let from = 0; from < data.length; from += rate / 2) {
      const window = data.subarray(from, Math.min(data.length, from + rate / 2));
      let sum = 0;
      for (const v of window) sum += v * v;
      rmsDbPerHalfSecond.push(round(10 * Math.log10(sum / Math.max(1, window.length) + 1e-12), 1));
    }
    return {
      decoded: true,
      seconds: round(buffer.duration, 4),
      sampleRate: rate,
      channels: buffer.numberOfChannels,
      peakDb: round(20 * Math.log10(peak + 1e-12), 2),
      rmsDbPerHalfSecond,
    };
  } catch (error) {
    return { decoded: false, error: String(error) };
  }
}

/** Plays `url`, a blob URL of `bytes` that the caller owns, and checks the file */
async function checkFile(video: HTMLVideoElement, bytes: ArrayBuffer, url: string): Promise<Checked> {
  let playback: Checked["playback"];
  try {
    playback = await checkPlayback(video, url);
  } catch (error) {
    playback = { error: String(error) };
  }
  return { bytes: bytes.byteLength, sha256: await sha256(bytes), playback, audio: await checkAudio(bytes) };
}

export function ReelSpike() {
  const [phase, setPhase] = useState<Phase>("probing");
  const [frames, setFrames] = useState(0);
  const [json, setJson] = useState("");
  const [sent, setSent] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const resultsRef = useRef<Results | null>(null);
  const setupRef = useRef<Setup | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const mp4Ref = useRef<ArrayBuffer | null>(null);
  const cancelRef = useRef<{ at: number; frames: number } | null>(null);
  // One blob URL per reel serves its check, its preview and its download link
  const previewUrlRef = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const show = () => setJson(JSON.stringify(resultsRef.current, null, 2));

  const stopWorker = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
  };

  const startWorker = (onReply: (reply: WorkerReply) => void): Worker => {
    stopWorker();
    const worker = new Worker(new URL("./reel.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerReply>) => onReply(event.data);
    worker.onerror = (event) => onReply({ type: "failed", message: event.message || "worker error", cancelled: false });
    workerRef.current = worker;
    return worker;
  };

  const send = (worker: Worker, request: WorkerRequest, transfer: Transferable[] = []) =>
    worker.postMessage(request, transfer);

  const releasePreview = () => {
    const url = previewUrlRef.current;
    previewUrlRef.current = null;
    setDownloadUrl(null);
    const video = videoRef.current;
    if (video) {
      video.removeAttribute("src");
      video.controls = false;
      video.load();
    }
    if (url) URL.revokeObjectURL(url);
  };

  const probeWorker = () =>
    new Promise<WorkerProbe | { error: string }>((resolve) => {
      const worker = startWorker((reply) => {
        if (reply.type === "probe") resolve(reply.probe);
        else if (reply.type === "failed") resolve({ error: reply.message });
        stopWorker();
      });
      send(worker, { type: "probe" });
    });

  const make = async () => {
    const results = resultsRef.current;
    const setup = setupRef.current;
    const support = results?.support;
    if (!results || !setup || !support?.picks.video) return;
    // Each run reports its own MP4 and answer
    setFrames(0);
    releasePreview();
    setSent("");
    mp4Ref.current = null;
    results.encode = null;
    results.output = null;
    results.answer = null;
    results.mp4File = null;
    try {
      let pcm: ReelPcm | null = null;
      let prepareAudioMs: number | null = null;
      const choice = support.picks.audio;
      if (choice && setup.clip !== "none") {
        setPhase("preparing");
        const started = performance.now();
        const response = await fetch(clipUrl(setup.locale, setup.clip, null));
        if (!response.ok) throw new Error(`clip ${response.status}`);
        pcm = await prepareClip(await response.arrayBuffer(), choice.sampleRate, choice.numberOfChannels);
        prepareAudioMs = round(performance.now() - started);
      }
      const audio: ReelAudio | null = pcm && choice ? { ...pcm, codec: choice.codec, bitrate: choice.bitrate } : null;
      setPhase("encoding");
      const reply = await new Promise<Extract<WorkerReply, { type: "done" | "failed" }>>((resolve) => {
        const worker = startWorker((message) => {
          if (message.type === "progress") setFrames(message.frames);
          else if (message.type === "done" || message.type === "failed") resolve(message);
        });
        const videoCodec = setup.mode === "constant" ? support.picks.videoConstant : support.picks.video;
        send(
          worker,
          { type: "encode", videoCodec: videoCodec ?? "", bitrateMode: setup.mode, audio },
          audio ? [audio.data.buffer] : [],
        );
      });
      stopWorker();
      // A cancel that came too late to stop the encode ends here too
      const cancel = cancelRef.current;
      cancelRef.current = null;
      if (reply.type === "failed") {
        if (reply.cancelled && cancel) {
          results.cancels.push({ atFrames: cancel.frames, replyMs: round(performance.now() - cancel.at) });
          setPhase("cancelled");
        } else {
          results.errors.push(`encode: ${reply.message}`);
          setPhase("failed");
        }
        show();
        return;
      }
      const { stats } = reply;
      results.encode = {
        pictureMs: round(reply.pictureMs),
        prepareAudioMs,
        audio:
          pcm && choice
            ? {
                codec: choice.codec,
                sampleRate: pcm.sampleRate,
                numberOfChannels: pcm.numberOfChannels,
                clipSeconds: round(pcm.clipSeconds, 3),
              }
            : null,
        drawMs: summarize(stats.drawMs),
        addMs: summarize(stats.addMs),
        finalizeMs: round(stats.finalizeMs),
        totalMs: round(stats.totalMs),
        overCap: reply.mp4.byteLength > REEL.maxBytes,
        video: stats.video,
        audioTrack: stats.audio,
      };
      mp4Ref.current = reply.mp4;
      setPhase("checking");
      show();
      const url = URL.createObjectURL(new Blob([reply.mp4], { type: "video/mp4" }));
      previewUrlRef.current = url;
      const video = videoRef.current;
      if (video) {
        results.output = await checkFile(video, reply.mp4, url);
        // The preview for a person: from the start, controls on, still muted until they unmute it
        video.currentTime = 0;
        video.controls = true;
      }
      setDownloadUrl(url);
      setPhase("done");
    } catch (error) {
      stopWorker();
      results.errors.push(`make: ${String(error)}`);
      setPhase("failed");
    }
    show();
  };

  const cancel = () => {
    const worker = workerRef.current;
    // A second tap would restart the 2 s timer and the timing TC-43-4 records
    if (!worker || cancelRef.current) return;
    cancelRef.current = { at: performance.now(), frames };
    setPhase("cancelling");
    send(worker, { type: "cancel" });
    // TC-43-4: the worker stops even if the encoder never answers
    setTimeout(() => {
      if (workerRef.current === worker) {
        stopWorker();
        cancelRef.current = null;
        resultsRef.current?.errors.push("cancel: no reply in 2 s, worker terminated");
        setPhase("cancelled");
        show();
      }
    }, 2000);
  };

  const checkOther = async (file: File) => {
    const results = resultsRef.current;
    const video = videoRef.current;
    if (!results || !video) return;
    const previous = phase;
    const url = URL.createObjectURL(file);
    setPhase("checking");
    try {
      results.crossPlay.push({ name: file.name, ...(await checkFile(video, await file.arrayBuffer(), url)) });
    } catch (error) {
      results.errors.push(`check ${file.name}: ${String(error)}`);
    } finally {
      // The preview is this page's reel again, if it made one
      const preview = previewUrlRef.current;
      if (preview) {
        video.src = preview;
      } else {
        video.removeAttribute("src");
        video.load();
      }
      URL.revokeObjectURL(url);
      setPhase(previous);
      show();
    }
  };

  /**
   * With report=1, sends the MP4, if this run made one, and then the results to the Mac. A failed
   * MP4 upload goes into the results, which are sent anyway. False when the results didn't arrive.
   */
  const report = async (answer: string | null): Promise<boolean> => {
    const results = resultsRef.current;
    const setup = setupRef.current;
    if (!results || !setup || sending) return false;
    if (answer !== null) results.answer = answer;
    show();
    if (!setup.report) return true;
    setSending(true);
    try {
      const mp4 = mp4Ref.current;
      if (mp4 && !results.mp4File) {
        try {
          results.mp4File = await postDevMp4(setup.locale, mp4);
        } catch (error) {
          results.errors.push(`report: ${describeError(error)}`);
        }
        show();
      }
      const outcome = await postDevReport(setup.locale, results);
      setSent(outcome.message);
      return outcome.ok;
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    const setup = setupFromUrl();
    setupRef.current = setup;
    const results: Results = {
      kind: "t08-reel",
      userAgent: navigator.userAgent,
      setup: { locale: setup.locale, clip: setup.clip, mode: setup.mode },
      pattern: PATTERN,
      support: null,
      encode: null,
      output: null,
      crossPlay: [],
      cancels: [],
      answer: null,
      mp4File: null,
      errors: [],
      csp: [],
    };
    resultsRef.current = results;
    const stopWatching = watchViolations((line) => results.csp.push(line));
    let live = true;
    void (async () => {
      const support = await probeSupport(await probeWorker());
      if (!live) return;
      results.support = support;
      setPhase(support.offered ? "ready" : "unsupported");
      show();
      if (support.offered && setup.auto) await make();
    })();
    return () => {
      live = false;
      stopWatching();
      stopWorker();
      const preview = previewUrlRef.current;
      if (preview) URL.revokeObjectURL(preview);
    };
    // The page sets up once: the setup comes from the URL, and a new setup is a fresh page
  }, []);

  const support = resultsRef.current?.support;
  const busy =
    phase === "probing" ||
    phase === "preparing" ||
    phase === "encoding" ||
    phase === "cancelling" ||
    phase === "checking";
  // Runs that end without a preview to answer for still send what they found (report=1)
  const sendable =
    setupRef.current?.report === true &&
    (phase === "failed" ||
      phase === "cancelled" ||
      phase === "unsupported" ||
      (phase === "ready" && (resultsRef.current?.crossPlay.length ?? 0) > 0));

  return (
    <section className="grid max-w-2xl gap-3" data-state={phase}>
      {phase === "unsupported" ? <p data-unsupported>{MESSAGE_UNSUPPORTED}</p> : null}
      {support ? (
        <p>
          {support.offered ? `Offered: ${support.picks.video}` : "Not offered"}
          {support.offered
            ? support.silent
              ? ", silent (no AAC encoder)"
              : `, with ${support.picks.audio?.codec} sound`
            : ""}
        </p>
      ) : (
        <p>Checking what this browser can encode...</p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="border border-(--ink) px-4 py-3"
          disabled={busy || sending || !support?.offered}
          onClick={() => void make()}
          data-make
        >
          Make the test video
        </button>
        {phase === "encoding" ? (
          <button type="button" className="border border-(--ink) px-4 py-3" onClick={cancel} data-cancel>
            Cancel
          </button>
        ) : null}
      </div>
      <label className="grid gap-1">
        <span>
          {phase} {frames} of {REEL.frames} frames
        </span>
        <progress max={REEL.frames} value={frames} data-progress={frames} />
      </label>
      <video ref={videoRef} className="w-48 border border-(--line)" muted playsInline />
      {downloadUrl ? (
        <a href={downloadUrl} download="muftah-t08-test.mp4" className="underline" data-download>
          Download the MP4
        </a>
      ) : null}
      <label className="grid gap-1">
        <span>Check an MP4</span>
        <input
          type="file"
          accept="video/mp4"
          data-check-file
          disabled={busy || sending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Cleared, so picking the same file again checks it again
            event.target.value = "";
            if (file) void checkOther(file);
          }}
        />
      </label>
      {phase === "done" ? (
        <div className="grid gap-2 border border-(--line) p-3">
          <p>Play the preview with the sound on. What happened?</p>
          <div className="flex flex-wrap gap-3">
            {["Played with sound", "Played, no sound", "Didn't play"].map((answer) => (
              <button
                key={answer}
                type="button"
                className="border border-(--ink) px-4 py-3"
                disabled={sending}
                onClick={() => void report(answer)}
              >
                {answer}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {sendable ? (
        <button
          type="button"
          className="justify-self-start border border-(--ink) px-4 py-3"
          disabled={sending}
          onClick={() => void report(null)}
          data-send
        >
          Send results
        </button>
      ) : null}
      <p className="text-[0.8rem]">{sent}</p>
      <pre className="max-h-96 overflow-auto text-[0.7rem] break-all whitespace-pre-wrap" data-results>
        {json}
      </pre>
    </section>
  );
}
