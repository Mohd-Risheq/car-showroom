import { describe, expect, it } from "vitest";
import { createChain, FFT_SIZE, GAIN } from "@/features/sound/player";
import { clipLevels, rmsDb } from "@/features/sound/tach";

// FR-15.2, FR-15.3 and BR-19: the graph the player builds. The browser runs in docs/evidence/T-07.

class FakeNode {
  readonly connections: unknown[] = [];
  connect(node: unknown) {
    this.connections.push(node);
    return node;
  }
}

function fakeContext() {
  const destination = new FakeNode();
  return {
    destination,
    createAnalyser: () => Object.assign(new FakeNode(), { fftSize: 32 }),
    createGain: () => Object.assign(new FakeNode(), { gain: { value: 1 } }),
  };
}

describe("the player's graph", () => {
  it("runs source → analyser → gain at 0.8 → speakers", () => {
    const context = fakeContext();
    const chain = createChain(context as unknown as BaseAudioContext);
    expect(chain.input).toBe(chain.analyser);
    expect((chain.analyser as unknown as FakeNode).connections).toEqual([chain.gain]);
    expect((chain.gain as unknown as FakeNode).connections).toEqual([context.destination]);
    expect(chain.gain.gain.value).toBe(GAIN);
    expect(GAIN).toBe(0.8);
    expect(chain.analyser.fftSize).toBe(FFT_SIZE);
  });

  // The analyser sits before the gain, so it reads the samples the clip's range came from.
  // With a gain of 0.8 in between, every live level would sit 1.9 dB under the range.
  it("measures the live level the way the clip's range was measured", () => {
    const samples = Float32Array.from({ length: FFT_SIZE * 20 }, (_, i) => Math.sin(i / 7) * (1 + Math.floor(i / FFT_SIZE)) * 0.04);
    const windows = Array.from({ length: 20 }, (_, w) => rmsDb(samples, w * FFT_SIZE, (w + 1) * FFT_SIZE));
    const levels = clipLevels(samples, FFT_SIZE);
    expect(levels.floorDb).toBe(windows[1]);
    expect(levels.ceilDb).toBe(windows[19]);
    // What the analyser hands over for the last window is that window's samples
    expect(rmsDb(samples.slice(19 * FFT_SIZE))).toBe(windows[19]);
  });
});
