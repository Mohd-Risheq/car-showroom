import { bitmapBytes, fitInside, loadOrder, nearestLoaded, sameSize, type Size } from "../domain/ring";
import type { FrameDecoder } from "./decode";

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
  #high: { index: number; fit: Size; bitmap: ImageBitmap } | null = null;
  #highRequest: { index: number; fit: Size; controller: AbortController } | null = null;

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
    if (this.#lifetime.signal.aborted) return;
    const source = this.#options.source.highRes(index);
    const fit = fitInside(source.size, box);
    // Nothing to do while this frame is shown or on its way at this size. A resize asks again.
    const isWanted = (frame: { index: number; fit: Size } | null) => frame?.index === index && sameSize(frame.fit, fit);
    if (isWanted(this.#high) || isWanted(this.#highRequest)) return;
    this.dropHigh();
    const request = { index, fit, controller: new AbortController() };
    this.#highRequest = request;
    void this.#decode(index, true, source, fit, request.controller.signal).then((bitmap) => {
      // Replaced or dropped meanwhile, or failed (a later rest asks again)
      const current = this.#highRequest === request;
      if (current) this.#highRequest = null;
      if (!bitmap) return;
      if (!current) {
        bitmap.close();
        return;
      }
      this.#high = { index, fit, bitmap };
      this.#options.onChange();
    });
  }

  /** Lets the high-resolution frame go as soon as the viewer moves (NFR-PERF-07) */
  dropHigh(): void {
    this.#highRequest?.controller.abort();
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
    const resize = sameSize(fit, source.size) ? null : fit;
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
