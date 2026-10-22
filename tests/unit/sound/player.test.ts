import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clipLevels, rmsDb } from "@/features/sound/domain/tach";
import { createChain, EnginePlayer, FFT_SIZE, GAIN, type PlayerEvent } from "@/features/sound/ui/player";

// FR-15.2, FR-15.3, FR-15.5 and BR-19: the player's graph, its start inside the gesture, its
// levels and its downloads, against a fake Web Audio. The browser runs are in docs/evidence/T-07.

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
});

// A clip that gets louder window by window, so its range has a distinct floor and ceiling
const CLIP = Float32Array.from(
  { length: FFT_SIZE * 20 },
  (_, i) => Math.sin(i / 7) * (1 + Math.floor(i / FFT_SIZE)) * 0.04,
);
// What the analyser hands over while the clip plays: its last window
const LIVE_WINDOW = CLIP.slice(19 * FFT_SIZE);
const CLIP_URL = "https://store.test/engine.wav";

class FakeAnalyser extends FakeNode {
  fftSize = 32;
  getFloatTimeDomainData(out: Float32Array) {
    out.set(LIVE_WINDOW.subarray(0, out.length));
  }
}

let contexts: FakeAudioContext[] = [];

class FakeAudioContext {
  readonly destination = new FakeNode();
  readonly sampleRate = 48_000;
  readonly currentTime = 0;
  state: AudioContextState = "suspended";
  readonly resume = vi.fn(async () => {
    this.state = "running";
  });
  readonly suspend = vi.fn(async () => {
    this.state = "suspended";
  });
  readonly close = vi.fn(async () => {
    this.state = "closed";
  });

  constructor() {
    contexts.push(this);
  }

  addEventListener() {}

  createAnalyser() {
    return new FakeAnalyser();
  }

  createGain() {
    return Object.assign(new FakeNode(), { gain: { value: 1 } });
  }

  createBufferSource() {
    return Object.assign(new FakeNode(), { buffer: null, onended: null, start: vi.fn(), stop: vi.fn() });
  }

  async decodeAudioData() {
    return { duration: CLIP.length / this.sampleRate, sampleRate: this.sampleRate, getChannelData: () => CLIP };
  }
}

const clipResponse = () => new Response(new Uint8Array(64));

describe("EnginePlayer, buffer mode", () => {
  beforeEach(() => {
    contexts = [];
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => clipResponse()),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates and resumes the context before it awaits anything, inside the tap (FR-15.2)", async () => {
    const player = new EnginePlayer({ url: CLIP_URL, mode: "buffer" });
    const playing = player.play();
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.resume).toHaveBeenCalledTimes(1);
    await playing;
    expect(player.playing).toBe(true);
    player.dispose();
  });

  it("starts nothing when paused while the clip downloads", async () => {
    let deliver: (response: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => (deliver = resolve))),
    );
    const createSource = vi.spyOn(FakeAudioContext.prototype, "createBufferSource");
    const events: PlayerEvent[] = [];
    const player = new EnginePlayer({ url: CLIP_URL, mode: "buffer", onEvent: (event) => events.push(event) });

    const playing = player.play();
    player.pause();
    deliver(clipResponse());
    await playing;

    expect(player.playing).toBe(false);
    expect(createSource).not.toHaveBeenCalled();
    expect(events.map((event) => event.type)).not.toContain("playing");
    player.dispose();
  });

  // The analyser sits before the gain, so it reads the samples the clip's range came from.
  // With the gain of 0.8 in between, every live level would sit 1.9 dB under the range.
  it("measures the live level the way it measured the clip's range (BR-19)", async () => {
    const player = new EnginePlayer({ url: CLIP_URL, mode: "buffer" });
    expect(player.levelDb()).toBe(rmsDb(new Float32Array(0)));
    await player.play();
    expect(player.levels).toEqual(clipLevels(CLIP, FFT_SIZE));
    expect(player.levelDb()).toBe(rmsDb(LIVE_WINDOW));
    player.dispose();
  });

  it("downloads again on the first play after a failed prefetch (FR-15.5)", async () => {
    const fetchClip = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockImplementation(async () => clipResponse());
    vi.stubGlobal("fetch", fetchClip);
    const events: PlayerEvent[] = [];
    const player = new EnginePlayer({ url: CLIP_URL, mode: "buffer", onEvent: (event) => events.push(event) });

    player.prefetch();
    await vi.waitFor(() => expect(events.map((event) => event.type)).toContain("prefetch"));
    await player.play();

    expect(fetchClip).toHaveBeenCalledTimes(2);
    expect(player.playing).toBe(true);
    expect(events.map((event) => event.type)).not.toContain("error");
    player.dispose();
  });

  it("reports a failed play, then plays on the next tap", async () => {
    const fetchClip = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockImplementation(async () => clipResponse());
    vi.stubGlobal("fetch", fetchClip);
    const events: PlayerEvent[] = [];
    const player = new EnginePlayer({ url: CLIP_URL, mode: "buffer", onEvent: (event) => events.push(event) });

    await player.play();
    expect(player.playing).toBe(false);
    expect(events.find((event) => event.type === "error")?.detail).toBe("Error: audio 503");

    await player.play();
    expect(player.playing).toBe(true);
    expect(fetchClip).toHaveBeenCalledTimes(2);
    player.dispose();
  });
});
