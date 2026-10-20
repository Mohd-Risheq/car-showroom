import { describe, expect, it } from "vitest";
import { clipEnvelope, FADE_SECONDS, gainAt, shapeClip } from "@/features/reel/domain/clip";

// DESIGN §5.16: the clip plays once from 0 s, 300 ms fade-in, 300 ms fade-out ending with the clip
// or at 15 s, whichever comes first; never looped

describe("clipEnvelope", () => {
  it("fades out with a clip shorter than the reel", () => {
    expect(clipEnvelope(8)).toEqual({ fadeInEnd: FADE_SECONDS, fadeOutStart: 7.7, end: 8 });
  });

  it("fades out at 15 s for a clip longer than the reel (BR-19 allows up to 30 s)", () => {
    expect(clipEnvelope(20)).toEqual({ fadeInEnd: 0.3, fadeOutStart: 14.7, end: 15 });
  });

  it("shares a clip shorter than both fades between them", () => {
    expect(clipEnvelope(0.4)).toEqual({ fadeInEnd: 0.2, fadeOutStart: 0.2, end: 0.4 });
  });
});

describe("gainAt", () => {
  const envelope = clipEnvelope(8);

  it("ramps in over the first 300 ms", () => {
    expect(gainAt(envelope, 0)).toBe(0);
    expect(gainAt(envelope, 0.15)).toBeCloseTo(0.5, 10);
    expect(gainAt(envelope, 0.3)).toBe(1);
  });

  it("holds full level, then ramps out to the clip's end", () => {
    expect(gainAt(envelope, 4)).toBe(1);
    expect(gainAt(envelope, 7.85)).toBeCloseTo(0.5, 10);
    expect(gainAt(envelope, 8)).toBe(0);
    expect(gainAt(envelope, 12)).toBe(0);
  });
});

describe("shapeClip", () => {
  const RATE = 1000;
  const ones = (seconds: number) => new Float32Array(seconds * RATE).fill(1);

  it("fills the whole reel, silent after a short clip, and never loops it", () => {
    const pcm = shapeClip(ones(8), RATE, 1);
    expect(pcm.data).toHaveLength(15 * RATE);
    expect(pcm.clipSeconds).toBe(8);
    expect(pcm.data[4 * RATE]).toBe(1);
    expect(pcm.data.subarray(8 * RATE).every((v) => v === 0)).toBe(true);
  });

  it("cuts a long clip at 15 s, fading out over its last 300 ms", () => {
    const pcm = shapeClip(ones(20), RATE, 1);
    expect(pcm.data).toHaveLength(15 * RATE);
    expect(pcm.data[14_000]).toBe(1);
    expect(pcm.data[14_850]).toBeCloseTo(0.5, 5);
    expect(pcm.data.at(-1)).toBeLessThan(0.01);
  });

  it("applies the fade-in from the first sample", () => {
    const pcm = shapeClip(ones(8), RATE, 1);
    expect(pcm.data[0]).toBe(0);
    expect(pcm.data[150]).toBeCloseTo(0.5, 5);
  });

  it("copies the mono clip to every channel, in planar layout", () => {
    const samples = ones(8).map((_, i) => Math.sin(i / 10));
    const pcm = shapeClip(samples, RATE, 2);
    const frames = 15 * RATE;
    expect(pcm.data).toHaveLength(2 * frames);
    expect(pcm.data.subarray(frames)).toEqual(pcm.data.subarray(0, frames));
    expect(pcm.numberOfChannels).toBe(2);
  });
});
