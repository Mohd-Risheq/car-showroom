import type { FrameDecoder } from "./decode";
import { bitmapBytes, fitInside, loadOrder, nearestLoaded, type Size } from "./ring";

// A spin set's decoded frames (FR-16.1, FR-16.5, FR-16.9, NFR-PERF-07): the low-resolution ring
// and at most one high-resolution frame. Every bitmap it lets go of is closed, so the decoded
// memory is what decodedBytes() adds up.

/** A frame file and its pixel size, which the spin set records for every variant */
export type FrameSource = { url: string; size: Size };
export type SpinSource = {
  frames: number;
  lowRes: (index: number) => FrameSource;
  highRes: (index: number) => FrameSource;
};
export type FrameRecord = {
  index: number;
  highRes: boolean;
  fetchMs: number;
  decodeMs: number;
  encodedBytes: number;
  size: Size;
  requested: Size | null;
};
export type StoreOptions = {
  source: SpinSource;
  decoder: FrameDecoder;
  onChange: () => void;
  onRecord?: (record: FrameRecord) => void;
};

/** A low-resolution frame decodes to fit 480 × 320, the viewer's 3:2 at the BR-20 width */
export const LOW_RES_BOX: Size = { width: 480, height: 320 };
const CONCURRENCY = 6;

export class FrameStore {
  readonly frames: number;
  readonly #options: StoreOptions;
  readonly #low: Array<ImageBitmap | undefined>;
  readonly #failed = new Set<number>();
  readonly #queue: number[] = [];
  readonly #lifetime = new AbortController();
  #active = 0;
  #restQueued = false;
  #high: { index: number; bitmap: ImageBitmap } | null = null;
  #highRequest: AbortController | null = null;

  constructor(options: StoreOptions) {
    this.#options = options;
    this.frames = options.source.frames;
    this.#low = new Array<ImageBitmap | undefined>(this.frames);
  }

  /** FR-16.1: the first pass, at most 36 evenly spaced frames */
  loadFirstPass(): void {
    this.#enqueue(loadOrder(this.frames).firstPass);
  }

  /** FR-16.1: a larger set's remaining frames, on the first interaction */
  loadRest(): void {
    if (this.#restQueued) return;
    this.#restQueued = true;
    this.#enqueue(loadOrder(this.frames).rest);
  }

  low(index: number): ImageBitmap | undefined {
    return this.#low[index];
  }

  /** FR-16.9: the loaded frame nearest a target; −1 while none has loaded */
  nearest(index: number): number {
    return nearestLoaded(index, this.frames, (k) => this.#low[k] !== undefined);
  }

  get loaded(): number {
    return this.#low.reduce((count, bitmap) => count + (bitmap ? 1 : 0), 0);
  }

  get failed(): number {
    return this.#failed.size;
  }

  high(index: number): ImageBitmap | undefined {
    return this.#high?.index === index ? this.#high.bitmap : undefined;
  }

  /** FR-16.5: one frame at high resolution, fitted to the canvas, replacing the previous one */
  requestHigh(index: number, box: Size): void {
    if (this.#high?.index === index || this.#lifetime.signal.aborted) return;
    this.dropHigh();
    const request = new AbortController();
    this.#highRequest = request;
    const source = this.#options.source.highRes(index);
    void this.#decode(index, true, source, fitInside(source.size, box), request.signal).then((bitmap) => {
      if (!bitmap) return;
      if (this.#highRequest !== request) {
        bitmap.close();
        return;
      }
      this.#highRequest = null;
      this.#high = { index, bitmap };
      this.#options.onChange();
    });
  }

  /** Lets the high-resolution frame go as soon as the viewer moves (NFR-PERF-07) */
  dropHigh(): void {
    this.#highRequest?.abort();
    this.#highRequest = null;
    this.#high?.bitmap.close();
    this.#high = null;
  }

  /** Decoded pixels held now: 4 bytes each (NFR-PERF-07) */
  decodedBytes(): number {
    let total = this.#high ? bitmapBytes(this.#high.bitmap) : 0;
    for (const bitmap of this.#low) if (bitmap) total += bitmapBytes(bitmap);
    return total;
  }

  dispose(): void {
    this.#lifetime.abort();
    this.#queue.length = 0;
    this.dropHigh();
    for (const bitmap of this.#low) bitmap?.close();
    this.#low.fill(undefined);
    this.#options.decoder.dispose();
  }

  #enqueue(indices: number[]): void {
    for (const index of indices) {
      if (!this.#low[index] && !this.#failed.has(index)) this.#queue.push(index);
    }
    this.#pump();
  }

  #pump(): void {
    while (this.#active < CONCURRENCY && !this.#lifetime.signal.aborted) {
      const index = this.#queue.shift();
      if (index === undefined) return;
      if (this.#low[index] || this.#failed.has(index)) continue;
      this.#active++;
      const source = this.#options.source.lowRes(index);
      void this.#decode(index, false, source, fitInside(source.size, LOW_RES_BOX), this.#lifetime.signal).then(
        (bitmap) => {
          this.#active--;
          if (bitmap) {
            this.#low[index] = bitmap;
            this.#options.onChange();
          }
          this.#pump();
        },
      );
    }
  }

  // One frame, or undefined when it failed (skipped silently, FR-16 error states) or was cancelled
  async #decode(
    index: number,
    highRes: boolean,
    source: FrameSource,
    fit: Size,
    signal: AbortSignal,
  ): Promise<ImageBitmap | undefined> {
    const resize = fit.width === source.size.width && fit.height === source.size.height ? null : fit;
    try {
      const decoded = await this.#options.decoder.decode(
        { url: source.url, resize, quality: highRes ? "high" : "medium" },
        signal,
      );
      if (signal.aborted || this.#lifetime.signal.aborted) {
        decoded.bitmap.close();
        return undefined;
      }
      this.#options.onRecord?.({
        index,
        highRes,
        fetchMs: decoded.fetchMs,
        decodeMs: decoded.decodeMs,
        encodedBytes: decoded.encodedBytes,
        size: { width: decoded.bitmap.width, height: decoded.bitmap.height },
        requested: resize,
      });
      return decoded.bitmap;
    } catch {
      if (!signal.aborted && !highRes) this.#failed.add(index);
      return undefined;
    }
  }
}
