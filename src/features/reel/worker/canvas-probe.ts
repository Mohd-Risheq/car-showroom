/**
 * SRS §10.8, run inside the reel worker: a 2D OffscreenCanvas there, and a VideoFrame made from
 * it, which is how each frame reaches the encoder. Null when both work, else what failed.
 */
export function workerCanvasProblem(): string | null {
  if (typeof OffscreenCanvas === "undefined") return "no OffscreenCanvas";
  const canvas = new OffscreenCanvas(16, 16);
  const ctx = canvas.getContext("2d");
  if (!ctx) return "no 2D context on OffscreenCanvas";
  if (typeof VideoFrame === "undefined") return "no VideoFrame";
  try {
    ctx.fillRect(0, 0, 16, 16);
    new VideoFrame(canvas, { timestamp: 0 }).close();
    return null;
  } catch (error) {
    return `VideoFrame from OffscreenCanvas failed: ${String(error)}`;
  }
}
