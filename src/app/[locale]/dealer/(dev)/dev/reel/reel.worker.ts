import { type BitrateMode, pickAudioConfig, pickVideoCodec, REEL } from "@/features/reel/domain/support";
import { workerCanvasProblem } from "@/features/reel/worker/canvas-probe";
import { type EncodeStats, encodeReel, type ReelAudio } from "@/features/reel/worker/encode";
import { drawPattern, makePicture } from "./pattern";

// Spike T-08's worker: draws the test pattern on an OffscreenCanvas and encodes it with
// src/features/reel/worker/encode.ts. Messages: probe, encode, cancel. Replies: probe, progress, done,
// failed.

export type WorkerRequest =
  | { type: "probe" }
  | { type: "encode"; videoCodec: string; bitrateMode: BitrateMode; audio: ReelAudio | null }
  | { type: "cancel" };

export type WorkerProbe = {
  /** SRS §10.8's check, null when it passes */
  canvasProblem: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  /** D-026: text in a worker needs FontFace there */
  fontFace: boolean;
};

export type WorkerReply =
  | { type: "probe"; probe: WorkerProbe }
  | { type: "progress"; frames: number }
  | { type: "done"; mp4: ArrayBuffer; stats: EncodeStats; pictureMs: number }
  | { type: "failed"; message: string; cancelled: boolean };

type Scope = {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerReply, transfer?: Transferable[]): void;
  FontFace?: unknown;
  fonts?: unknown;
};
const scope = self as unknown as Scope;
let running: AbortController | null = null;

async function probe(): Promise<WorkerProbe> {
  const audio = await pickAudioConfig();
  return {
    canvasProblem: workerCanvasProblem(),
    videoCodec: await pickVideoCodec(),
    audioCodec: audio ? `${audio.codec} ${audio.sampleRate} Hz ${audio.numberOfChannels} ch` : null,
    fontFace: typeof scope.FontFace === "function" && typeof scope.fonts === "object",
  };
}

async function encode(request: Extract<WorkerRequest, { type: "encode" }>, signal: AbortSignal): Promise<void> {
  const canvas = new OffscreenCanvas(REEL.width, REEL.height);
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("no 2D context");
  const pictureStart = performance.now();
  const picture = makePicture();
  const pictureMs = performance.now() - pictureStart;
  let reported = 0;
  const { mp4, stats } = await encodeReel({
    canvas,
    draw: (index) => drawPattern(ctx, index, picture),
    videoCodec: request.videoCodec,
    bitrateMode: request.bitrateMode,
    audio: request.audio,
    signal,
    onProgress: (frames) => {
      if (frames - reported < 15 && frames < REEL.frames) return;
      reported = frames;
      scope.postMessage({ type: "progress", frames });
    },
  });
  scope.postMessage({ type: "done", mp4, stats, pictureMs }, [mp4]);
}

scope.onmessage = (event) => {
  const request = event.data;
  if (request.type === "cancel") {
    running?.abort();
    return;
  }
  if (request.type === "probe") {
    probe().then(
      (result) => scope.postMessage({ type: "probe", probe: result }),
      (error: unknown) => scope.postMessage({ type: "failed", message: `probe: ${String(error)}`, cancelled: false }),
    );
    return;
  }
  // A second encode replaces the first
  running?.abort();
  const controller = new AbortController();
  running = controller;
  encode(request, controller.signal)
    .catch((error: unknown) =>
      scope.postMessage({ type: "failed", message: String(error), cancelled: controller.signal.aborted }),
    )
    .finally(() => {
      if (running === controller) running = null;
    });
};
