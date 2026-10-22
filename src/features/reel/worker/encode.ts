import {
  AudioSample,
  AudioSampleSource,
  BufferTarget,
  CanvasSource,
  type EncodedPacket,
  Mp4OutputFormat,
  Output,
  Quality,
} from "mediabunny";
import type { ReelPcm } from "../domain/clip";
import { addAacRollGroup } from "../domain/mp4";
import { type BitrateMode, REEL } from "../domain/support";

// Reel It's encoder path (FR-43, SRS §11.6, D-030). Each frame is drawn on an OffscreenCanvas in a
// worker, then Mediabunny's sources drive WebCodecs: H.264 through VideoEncoder, AAC through
// AudioEncoder. Mediabunny muxes a non-fragmented MP4 with its index ahead of the media, so a
// player can start without reading to the end; mp4.ts then adds what Apple's players need.

export type ReelAudio = ReelPcm & { codec: string; bitrate: number };

export type EncodeOptions = {
  canvas: OffscreenCanvas;
  /** Draws frame `index`, from 0 to 449, on the canvas */
  draw: (index: number) => void;
  videoCodec: string;
  bitrate?: number;
  bitrateMode?: BitrateMode;
  /** Null makes a silent reel with no audio track at all (FR-43.3) */
  audio: ReelAudio | null;
  onProgress?: (frames: number) => void;
  signal?: AbortSignal;
};

export type TrackStats = {
  /** What Mediabunny passed to the encoder */
  encoderConfig: Record<string, unknown> | null;
  /** The codec string the encoder reported for its output */
  decoderCodec: string | null;
  packets: number;
  keyPackets: number;
  bytes: number;
};

export type EncoderDelay = { samples: number; correlation: number } | { samples: 0; problem: string };

/** Whether the AAC track got Apple's 'roll' group (mp4.ts), and why not when it didn't */
export type RollGroup = { added: true } | { added: false; reason: string };

export type EncodeStats = {
  video: TrackStats;
  audio: (TrackStats & { delay: EncoderDelay; rollGroup: RollGroup }) | null;
  /** Per frame: drawing, then waiting for the encoder to take the frame */
  drawMs: number[];
  addMs: number[];
  finalizeMs: number;
  totalMs: number;
};

// Audio goes in a second at a time, just ahead of the video, so the file's chunks alternate
const AUDIO_PIECE_SECONDS = 1;

const emptyStats = (): TrackStats => ({ encoderConfig: null, decoderCodec: null, packets: 0, keyPackets: 0, bytes: 0 });

function count(track: TrackStats, packet: EncodedPacket, decoderCodec: string | undefined): void {
  track.packets += 1;
  track.bytes += packet.byteLength;
  if (packet.type === "key") track.keyPackets += 1;
  if (decoderCodec) track.decoderCodec = decoderCodec;
}

const plain = (config: object): Record<string, unknown> =>
  JSON.parse(JSON.stringify(config)) as Record<string, unknown>;

// AAC-LC's AudioSpecificConfig: object type 2, the rate's index, the channel count (ISO/IEC
// 14496-3, 1.6.2.1). The delay check decodes with this, not with what the encoder reports: WebKit
// reports the whole esds descriptor, which its own AudioDecoder then refuses (D-030). Mediabunny
// repairs the file's copy the same way.
const AAC_RATES = [96_000, 88_200, 64_000, 48_000, 44_100, 32_000, 24_000, 22_050, 16_000, 12_000, 11_025, 8_000];
function aacLcConfig(sampleRate: number, channels: number): Uint8Array {
  const bits = (2 << 11) | (AAC_RATES.indexOf(sampleRate) << 7) | (channels << 3);
  return new Uint8Array([bits >> 8, bits & 0xff]);
}

/**
 * How many samples the AAC-LC encoder puts ahead of the audio (its priming). WebCodecs doesn't
 * report it, and without an edit list a player plays it, so the sound starts late: 2,112 samples,
 * 44 ms, in Chrome and WebKit on macOS (D-030). Found by encoding a noise burst and decoding it
 * again; 0 when that can't run, which leaves the delay in the file.
 */
export async function measureEncoderDelay(config: AudioEncoderConfig): Promise<EncoderDelay> {
  if (typeof AudioDecoder === "undefined") return { samples: 0, problem: "no AudioDecoder" };
  const { sampleRate: rate, numberOfChannels: channels } = config;
  const length = Math.round(rate * 0.5);
  const at = Math.round(rate * 0.1);
  let state = 0x7e08;
  const burst = Float32Array.from({ length: 256 }, (_, i) => {
    state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
    return (state / 2 ** 32 - 0.5) * Math.sin((Math.PI * i) / 255) ** 2;
  });
  const planar = new Float32Array(length * channels);
  for (let channel = 0; channel < channels; channel += 1) planar.set(burst, channel * length + at);

  try {
    const chunks: EncodedAudioChunk[] = [];
    let failure: unknown = null;
    const encoder = new AudioEncoder({
      output: (chunk) => chunks.push(chunk),
      error: (error) => {
        failure = error;
      },
    });
    encoder.configure(config);
    const data = new AudioData({
      format: "f32-planar",
      sampleRate: rate,
      numberOfFrames: length,
      numberOfChannels: channels,
      timestamp: 0,
      data: planar,
    });
    encoder.encode(data);
    data.close();
    await encoder.flush();
    encoder.close();
    if (failure || chunks.length === 0) return { samples: 0, problem: `encode: ${String(failure ?? "no output")}` };

    const decoded: Float32Array[] = [];
    const decoder = new AudioDecoder({
      output: (audio) => {
        const out = new Float32Array(audio.numberOfFrames);
        audio.copyTo(out, { planeIndex: 0, format: "f32-planar" });
        decoded.push(out);
        audio.close();
      },
      error: (error) => {
        failure = error;
      },
    });
    decoder.configure({
      codec: config.codec,
      sampleRate: rate,
      numberOfChannels: channels,
      description: aacLcConfig(rate, channels),
    });
    for (const chunk of chunks) decoder.decode(chunk);
    await decoder.flush();
    decoder.close();
    if (failure) return { samples: 0, problem: `decode: ${String(failure)}` };

    const output = new Float32Array(decoded.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of decoded) {
      output.set(part, offset);
      offset += part.length;
    }
    // Where the burst comes out: the best normalized match within 200 ms after where it went in
    let best = { position: 0, correlation: 0 };
    const burstNorm = Math.sqrt(burst.reduce((sum, v) => sum + v * v, 0));
    for (let position = at; position < Math.min(output.length - burst.length, at + rate * 0.2); position += 1) {
      let dot = 0;
      let energy = 0;
      for (let i = 0; i < burst.length; i += 1) {
        const v = output[position + i] ?? 0;
        dot += v * (burst[i] ?? 0);
        energy += v * v;
      }
      const correlation = dot / (burstNorm * Math.sqrt(energy) || 1);
      if (correlation > best.correlation) best = { position, correlation };
    }
    if (best.correlation < 0.5) return { samples: 0, problem: `no clear match (${best.correlation.toFixed(2)})` };
    return { samples: best.position - at, correlation: Math.round(best.correlation * 1000) / 1000 };
  } catch (error) {
    return { samples: 0, problem: String(error) };
  }
}

/**
 * Adds a second of audio. Timestamps start `delay` samples early, so Mediabunny writes an edit list
 * that skips the encoder's priming and the sound lines up with the first frame.
 */
async function addAudio(source: AudioSampleSource, audio: ReelAudio, from: number, delay: number): Promise<void> {
  const frames = audio.data.length / audio.numberOfChannels;
  const start = Math.round(from * audio.sampleRate);
  const end = Math.min(frames, Math.round((from + AUDIO_PIECE_SECONDS) * audio.sampleRate));
  if (end <= start) return;
  const length = end - start;
  const piece = new Float32Array(length * audio.numberOfChannels);
  for (let channel = 0; channel < audio.numberOfChannels; channel += 1) {
    piece.set(audio.data.subarray(channel * frames + start, channel * frames + end), channel * length);
  }
  const sample = new AudioSample({
    data: piece,
    format: "f32-planar",
    numberOfChannels: audio.numberOfChannels,
    sampleRate: audio.sampleRate,
    timestamp: (start - delay) / audio.sampleRate,
  });
  try {
    await source.add(sample);
  } finally {
    sample.close();
  }
}

export async function encodeReel(options: EncodeOptions): Promise<{ mp4: ArrayBuffer; stats: EncodeStats }> {
  const started = performance.now();
  const stats: EncodeStats = { video: emptyStats(), audio: null, drawMs: [], addMs: [], finalizeMs: 0, totalMs: 0 };
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });

  const video = new CanvasSource(options.canvas, {
    codec: "avc",
    fullCodecString: options.videoCodec,
    // An explicit bitrate, so Mediabunny never switches to quantizer encoding (BR-39's 8 Mbps)
    quality: new Quality({
      bitrate: options.bitrate ?? REEL.videoBitrate,
      bitrateMode: options.bitrateMode ?? "variable",
    }),
    onEncoderConfig: (config) => {
      stats.video.encoderConfig = plain(config);
    },
    onEncodedPacket: (packet, meta) => count(stats.video, packet, meta?.decoderConfig?.codec),
  });
  output.addVideoTrack(video, { frameRate: REEL.fps });

  const audio = options.audio;
  let audioSource: AudioSampleSource | null = null;
  let delay = 0;
  if (audio) {
    const measured = await measureEncoderDelay({
      codec: audio.codec,
      sampleRate: audio.sampleRate,
      numberOfChannels: audio.numberOfChannels,
      bitrate: audio.bitrate,
    });
    delay = measured.samples;
    const audioStats = {
      ...emptyStats(),
      delay: measured,
      rollGroup: { added: false, reason: "not finished" } as RollGroup,
    };
    stats.audio = audioStats;
    audioSource = new AudioSampleSource({
      codec: "aac",
      fullCodecString: audio.codec,
      quality: new Quality({ bitrate: audio.bitrate }),
      onEncoderConfig: (config) => {
        audioStats.encoderConfig = plain(config);
      },
      onEncodedPacket: (packet, meta) => count(audioStats, packet, meta?.decoderConfig?.codec),
    });
    output.addAudioTrack(audioSource);
  }

  const cancel = () => void output.cancel();
  options.signal?.addEventListener("abort", cancel, { once: true });
  try {
    await output.start();
    let audioQueued = 0;
    for (let index = 0; index < REEL.frames; index += 1) {
      options.signal?.throwIfAborted();
      const time = index / REEL.fps;
      while (audioSource && audio && audioQueued < REEL.seconds && audioQueued <= time + AUDIO_PIECE_SECONDS) {
        await addAudio(audioSource, audio, audioQueued, delay);
        audioQueued += AUDIO_PIECE_SECONDS;
      }
      const drawStart = performance.now();
      options.draw(index);
      const addStart = performance.now();
      // Resolves when the encoder can take another frame, so the loop never outruns it
      await video.add(time, 1 / REEL.fps);
      stats.drawMs.push(addStart - drawStart);
      stats.addMs.push(performance.now() - addStart);
      options.onProgress?.(index + 1);
    }
    video.close();
    audioSource?.close();
    const finalizeStart = performance.now();
    await output.finalize();
    stats.finalizeMs = performance.now() - finalizeStart;
  } catch (error) {
    if (output.state !== "canceled" && output.state !== "finalized") await output.cancel().catch(() => undefined);
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", cancel);
  }

  let mp4 = output.target.buffer;
  if (!mp4) throw new Error("The muxer returned no file");
  if (stats.audio && delay <= 0) {
    // With no priming edit, AVFoundation's own trim of 2,112 samples is the better guess (D-030)
    stats.audio.rollGroup = { added: false, reason: "no priming edit" };
  } else if (stats.audio) {
    try {
      const grouped = addAacRollGroup(mp4);
      stats.audio.rollGroup = grouped === mp4 ? { added: false, reason: "no AAC track without one" } : { added: true };
      mp4 = grouped;
    } catch (error) {
      // The file as Mediabunny wrote it still plays everywhere, 44 ms early in Apple's players
      stats.audio.rollGroup = { added: false, reason: String(error) };
    }
  }
  stats.totalMs = performance.now() - started;
  return { mp4, stats };
}
