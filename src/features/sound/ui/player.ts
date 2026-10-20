import { clipLevels, type Levels, rmsDb, SILENCE_DB } from "../domain/tach";

// The Hear It player (FR-15, DESIGN §5.3), first cut from spike T-07. T-40 builds on it.
//
// iOS starts audio only inside a user gesture, so play() creates or resumes the AudioContext
// before it awaits anything (FR-15.2). Call it straight from the click handler. The graph is
// source → analyser → gain → destination: the analyser reads the clip before the gain, where
// clipLevels() measured its range, so the live level and the needle mapping agree (BR-19).
//
// Two ways in. D-029 made "buffer" the default:
// - "buffer": fetch and decode the whole file, then play it from an AudioBufferSourceNode. The
//   decoded samples give the clip's range before it plays.
// - "element": an <audio> element through createMediaElementSource. It streams, but it has no
//   samples before playback, so the range still comes from decoding the file. It stays for the
//   iPhone's silent-switch test only, and T-40 settles whether it goes.

export type PlayerMode = "buffer" | "element";

/** FR-15.2 */
export const GAIN = 0.8;
/** The analyser's window, in samples: about 43 ms at 48 kHz */
export const FFT_SIZE = 2048;

export type Chain = { input: AudioNode; analyser: AnalyserNode; gain: GainNode };

/** analyser → gain → destination. Sources connect to `input`, which is the analyser. */
export function createChain(context: BaseAudioContext): Chain {
  const analyser = context.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  const gain = context.createGain();
  gain.gain.value = GAIN;
  analyser.connect(gain);
  gain.connect(context.destination);
  return { input: analyser, analyser, gain };
}

type AudioSession = { type: string };

/** Safari's Audio Session API, where the browser has it */
export function audioSession(): AudioSession | undefined {
  return (navigator as Navigator & { audioSession?: AudioSession }).audioSession;
}

export type PlayerEvent = { at: number; type: string; detail?: string };

export type PlayerOptions = {
  url: string;
  mode: PlayerMode;
  /** Sets Safari's audio session type before the context starts. Unset keeps the browser's default. */
  sessionType?: string | undefined;
  onEvent?: ((event: PlayerEvent) => void) | undefined;
};

type Graph = { context: AudioContext; chain: Chain };

export class EnginePlayer {
  readonly #options: PlayerOptions;
  #graph: Graph | null = null;
  #bytes: Promise<ArrayBuffer> | null = null;
  #decoded: Promise<AudioBuffer> | null = null;
  #buffer: AudioBuffer | null = null;
  #levels: Levels | null = null;
  #source: AudioBufferSourceNode | null = null;
  #element: HTMLAudioElement | null = null;
  #elementConnected = false;
  #samples: Float32Array<ArrayBuffer> | null = null;
  #startedAt = 0;
  #offset = 0;
  #playing = false;

  constructor(options: PlayerOptions) {
    this.#options = options;
  }

  get context(): AudioContext | null {
    return this.#graph?.context ?? null;
  }

  get playing(): boolean {
    return this.#playing;
  }

  /** The clip's range (BR-19), once its file is decoded */
  get levels(): Levels | null {
    return this.#levels;
  }

  get duration(): number | null {
    if (this.#buffer) return this.#buffer.duration;
    const duration = this.#element?.duration;
    return duration !== undefined && Number.isFinite(duration) ? duration : null;
  }

  get currentTime(): number {
    if (this.#options.mode === "element") return this.#element?.currentTime ?? 0;
    if (!this.#playing || !this.#source || !this.#graph) return this.#offset;
    const time = this.#offset + (this.#graph.context.currentTime - this.#startedAt);
    return Math.min(time, this.#buffer?.duration ?? time);
  }

  /** FR-15.5: hover or focus on the play control starts the download */
  prefetch(): void {
    if (this.#options.mode === "element") this.#ensureElement().preload = "auto";
    // Reported, and not kept: the next play() downloads again
    this.#fetch().catch((error: unknown) => this.#emit("prefetch", errorText(error)));
  }

  /** Call from a click handler: everything before the first await runs inside the gesture */
  play(): Promise<void> {
    if (this.#playing) return Promise.resolve();
    const { context, chain } = this.#ensureGraph();
    const resumed = context.resume();
    this.#playing = true;
    if (this.#options.mode === "element") {
      const element = this.#ensureElement();
      if (!this.#elementConnected) {
        context.createMediaElementSource(element).connect(chain.input);
        this.#elementConnected = true;
      }
      const started = element.play();
      void this.#decode(context).catch((error: unknown) => this.#fail(error));
      return Promise.all([resumed, started]).then(
        () => this.#emit("playing"),
        (error: unknown) => this.#fail(error),
      );
    }
    return (async () => {
      const buffer = await this.#decode(context);
      // A pause while the file loaded wins
      if (!this.#playing) return;
      this.#start(context, chain, buffer);
      await resumed;
      this.#emit("playing");
    })().catch((error: unknown) => this.#fail(error));
  }

  pause(): void {
    if (!this.#playing) return;
    this.#offset = this.currentTime;
    this.#playing = false;
    this.#element?.pause();
    this.#stopSource();
    this.#emit("paused");
    // Let the audio hardware sleep. The next play() resumes the context inside its gesture.
    void this.#graph?.context.suspend();
  }

  /** The clip's RMS level now, in dBFS, measured before the gain */
  levelDb(): number {
    const analyser = this.#graph?.chain.analyser;
    if (!analyser || !this.#playing) return SILENCE_DB;
    this.#samples ??= new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(this.#samples);
    return rmsDb(this.#samples);
  }

  dispose(): void {
    this.pause();
    this.#element?.removeAttribute("src");
    this.#element?.load();
    void this.#graph?.context.close();
  }

  #ensureGraph(): Graph {
    if (this.#graph) return this.#graph;
    const session = audioSession();
    if (session && this.#options.sessionType) {
      session.type = this.#options.sessionType;
      this.#emit("session", session.type);
    }
    const context = new AudioContext({ latencyHint: "interactive" });
    context.addEventListener("statechange", () => this.#emit("context", context.state));
    this.#graph = { context, chain: createChain(context) };
    this.#emit("context", `created ${context.state} at ${context.sampleRate} Hz`);
    return this.#graph;
  }

  #ensureElement(): HTMLAudioElement {
    if (this.#element) return this.#element;
    const element = new Audio();
    // The store is another origin, and the analyser reads silence from media without CORS (T-37)
    element.crossOrigin = "anonymous";
    element.preload = "none";
    element.src = this.#options.url;
    for (const type of ["playing", "waiting", "stalled", "error"]) {
      element.addEventListener(type, () => this.#emit("element", type));
    }
    element.addEventListener("ended", () => this.#ended());
    this.#element = element;
    return element;
  }

  #fetch(): Promise<ArrayBuffer> {
    this.#bytes ??= fetch(this.#options.url)
      .then((response) => {
        if (!response.ok) throw new Error(`audio ${response.status}`);
        return response.arrayBuffer();
      })
      .catch((error: unknown) => {
        // A failed download is never cached, so a retry downloads again
        this.#bytes = null;
        throw error;
      });
    return this.#bytes;
  }

  #decode(context: AudioContext): Promise<AudioBuffer> {
    this.#decoded ??= this.#fetch()
      .then((bytes) => {
        this.#emit("fetched", `${bytes.byteLength} B`);
        return context.decodeAudioData(bytes);
      })
      .then(
        (buffer) => {
          // Decoded at the context's rate, so FFT_SIZE samples span what the analyser reads
          this.#levels = clipLevels(buffer.getChannelData(0), FFT_SIZE);
          this.#buffer = this.#options.mode === "buffer" ? buffer : null;
          this.#emit("decoded", `${buffer.duration.toFixed(3)} s at ${buffer.sampleRate} Hz`);
          return buffer;
        },
        (error: unknown) => {
          // Decoding detaches the bytes, so a retry fetches them again
          this.#bytes = null;
          this.#decoded = null;
          throw error;
        },
      );
    return this.#decoded;
  }

  #start(context: AudioContext, chain: Chain, buffer: AudioBuffer): void {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(chain.input);
    source.onended = () => {
      // stop() fires this too, after #stopSource() has let go of the source
      if (this.#source === source) this.#ended();
    };
    if (this.#offset >= buffer.duration) this.#offset = 0;
    source.start(0, this.#offset);
    this.#startedAt = context.currentTime;
    this.#source = source;
  }

  #stopSource(): void {
    const source = this.#source;
    this.#source = null;
    source?.stop();
  }

  #ended(): void {
    this.#playing = false;
    this.#source = null;
    this.#offset = 0;
    this.#emit("ended");
    void this.#graph?.context.suspend();
  }

  #fail(error: unknown): void {
    this.#playing = false;
    this.#stopSource();
    this.#emit("error", errorText(error));
  }

  #emit(type: string, detail?: string): void {
    this.#options.onEvent?.({ at: performance.now(), type, ...(detail === undefined ? {} : { detail }) });
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
