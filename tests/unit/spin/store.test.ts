import { describe, expect, it, vi } from "vitest";
import { bitmapBytes, fitInside, loadOrder, type Size } from "@/features/spin/domain/ring";
import type { FrameDecoder } from "@/features/spin/ui/decode";
import type { DecodeRequest, Decoded } from "@/features/spin/ui/fetch-decode";
import { FrameStore, LOW_RES_BOX, type SpinSource } from "@/features/spin/ui/store";

// FR-16.1, FR-16.5, FR-16.9 and NFR-PERF-07: what the spin store decodes, how many at once and
// at what size, and that every bitmap it lets go of is closed. The decoder is a fake whose
// requests each test settles itself.

const FRAMES = 12;
const LOW_SIZE: Size = { width: 960, height: 640 };
const HIGH_SIZE: Size = { width: 1280, height: 853 };
const source: SpinSource = {
  frames: FRAMES,
  lowRes: (index) => ({ url: `low-${index}.webp`, size: LOW_SIZE }),
  highRes: (index) => ({ url: `high-${index}.webp`, size: HIGH_SIZE }),
};

type FakeBitmap = Size & { close: ReturnType<typeof vi.fn> };
type Call = { request: DecodeRequest; signal: AbortSignal; succeed: () => FakeBitmap; fail: () => void };

function fakeDecoder() {
  const calls: Call[] = [];
  const decoder = {
    dispose: vi.fn(),
    decode: (request: DecodeRequest, signal: AbortSignal) =>
      new Promise<Decoded>((resolve, reject) => {
        calls.push({
          request,
          signal,
          succeed: () => {
            const bitmap: FakeBitmap = { ...(request.resize ?? LOW_SIZE), close: vi.fn() };
            resolve({ bitmap: bitmap as unknown as ImageBitmap, encodedBytes: 1, fetchMs: 1, decodeMs: 1 });
            return bitmap;
          },
          fail: () => reject(new Error("decode failed")),
        });
      }),
  } satisfies FrameDecoder;
  return { decoder, calls };
}

function setUp() {
  const { decoder, calls } = fakeDecoder();
  const onChange = vi.fn();
  const store = new FrameStore({ source, decoder, onChange });
  return { store, decoder, calls, onChange };
}

// Lets the store's promise callbacks run
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const at = (calls: Call[], index: number): Call => {
  const call = calls[index];
  if (!call) throw new Error(`no decode request ${index}`);
  return call;
};

describe("the first pass (FR-16.1, FR-16.9)", () => {
  it("decodes six frames at a time, in loading order, fitted inside 480 × 320", async () => {
    const { store, calls, onChange } = setUp();
    store.loadFirstPass();
    const order = loadOrder(FRAMES).firstPass;
    expect(calls.map((call) => call.request.url)).toEqual(order.slice(0, 6).map((index) => `low-${index}.webp`));
    expect(calls[0]?.request).toEqual({ url: `low-${order[0]}.webp`, resize: fitInside(LOW_SIZE, LOW_RES_BOX), quality: "medium" });

    at(calls, 0).succeed();
    await settle();
    expect(calls).toHaveLength(7);
    expect(store.low(order[0] ?? -1)).toBeDefined();

    for (let k = 1; k < FRAMES; k += 1) {
      at(calls, k).succeed();
      await settle();
    }
    expect(calls).toHaveLength(FRAMES);
    expect(store.loaded).toBe(FRAMES);
    expect(onChange).toHaveBeenCalledTimes(FRAMES);
  });

  it("skips frames that fail and keeps loading the rest", async () => {
    const { store, calls } = setUp();
    store.loadFirstPass();
    for (let k = 0; k < 6; k += 1) at(calls, k).fail();
    await settle();
    expect(store.failed).toBe(6);
    expect(calls).toHaveLength(FRAMES);

    for (let k = 6; k < FRAMES; k += 1) at(calls, k).succeed();
    await settle();
    expect(store.loaded).toBe(6);
    // A failed frame is not asked for again, and the nearest loaded one stands in for it
    store.loadRest();
    expect(calls).toHaveLength(FRAMES);
    const failedIndex = loadOrder(FRAMES).firstPass[0] ?? -1;
    expect(store.nearest(failedIndex)).not.toBe(failedIndex);
  });
});

describe("the high-resolution frame (FR-16.5, NFR-PERF-07)", () => {
  const box: Size = { width: 640, height: 400 };
  const larger: Size = { width: 1280, height: 800 };

  it("decodes fitted to the canvas, and again at the new size after a resize at rest", async () => {
    const { store, calls } = setUp();
    store.requestHigh(3, box);
    expect(calls[0]?.request).toEqual({ url: "high-3.webp", resize: fitInside(HIGH_SIZE, box), quality: "high" });
    const first = at(calls, 0).succeed();
    await settle();
    expect(store.high(3)).toBe(first);

    store.requestHigh(3, box);
    expect(calls).toHaveLength(1);

    store.requestHigh(3, larger);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.request.resize).toEqual(fitInside(HIGH_SIZE, larger));
    expect(first.close).toHaveBeenCalledTimes(1);
    const second = at(calls, 1).succeed();
    await settle();
    expect(store.high(3)).toBe(second);
  });

  it("asks once while a frame is on its way, and again after it failed", async () => {
    const { store, calls } = setUp();
    store.requestHigh(5, box);
    store.requestHigh(5, box);
    expect(calls).toHaveLength(1);
    at(calls, 0).fail();
    await settle();
    expect(store.high(5)).toBeUndefined();
    store.requestHigh(5, box);
    expect(calls).toHaveLength(2);
  });

  it("lets go of the frame when the viewer moves, and closes one that arrives late", async () => {
    const { store, calls } = setUp();
    store.requestHigh(2, box);
    const shown = at(calls, 0).succeed();
    await settle();
    store.dropHigh();
    expect(shown.close).toHaveBeenCalledTimes(1);
    expect(store.high(2)).toBeUndefined();

    store.requestHigh(2, box);
    store.dropHigh();
    expect(at(calls, 1).signal.aborted).toBe(true);
    const late = at(calls, 1).succeed();
    await settle();
    expect(late.close).toHaveBeenCalledTimes(1);
    expect(store.high(2)).toBeUndefined();
  });
});

describe("memory (NFR-PERF-07)", () => {
  it("adds up 4 bytes per decoded pixel", async () => {
    const { store, calls } = setUp();
    store.loadFirstPass();
    at(calls, 0).succeed();
    at(calls, 1).succeed();
    store.requestHigh(0, { width: 640, height: 400 });
    at(calls, 6).succeed();
    await settle();
    expect(store.decodedBytes()).toBe(2 * bitmapBytes(LOW_RES_BOX) + bitmapBytes(fitInside(HIGH_SIZE, { width: 640, height: 400 })));
  });

  it("closes every bitmap and the decoder on dispose, and a bitmap that arrives after it", async () => {
    const { store, calls, decoder } = setUp();
    store.loadFirstPass();
    const low = at(calls, 0).succeed();
    store.requestHigh(0, { width: 640, height: 400 });
    const high = at(calls, 6).succeed();
    await settle();

    store.dispose();
    expect(low.close).toHaveBeenCalledTimes(1);
    expect(high.close).toHaveBeenCalledTimes(1);
    expect(decoder.dispose).toHaveBeenCalledTimes(1);
    expect(store.loaded).toBe(0);
    expect(store.decodedBytes()).toBe(0);

    const late = at(calls, 1).succeed();
    await settle();
    expect(late.close).toHaveBeenCalledTimes(1);
    expect(store.loaded).toBe(0);
  });
});
