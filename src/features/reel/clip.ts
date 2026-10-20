import { REEL } from "./support";

// The engine clip in a reel (DESIGN §5.16): it plays once from 0 s with a 300 ms fade-in, and fades
// out over 300 ms ending with the clip or at 15 s, whichever comes first. It never loops. The audio
// track is the reel's full length, silent after the clip, so both tracks end together.

export const FADE_SECONDS = 0.3;

export type Envelope = { fadeInEnd: number; fadeOutStart: number; end: number };

export function clipEnvelope(clipSeconds: number, reelSeconds: number = REEL.seconds): Envelope {
  const end = Math.min(clipSeconds, reelSeconds);
  // Only a clip shorter than both fades together (BR-19's minimum is 5 s) shares its time between them
  const fade = Math.min(FADE_SECONDS, end / 2);
  return { fadeInEnd: fade, fadeOutStart: end - fade, end };
}

/** Linear fades, as gain from 0 to 1 */
export function gainAt(envelope: Envelope, seconds: number): number {
  if (seconds <= 0 || seconds >= envelope.end) return 0;
  if (seconds < envelope.fadeInEnd) return seconds / envelope.fadeInEnd;
  if (seconds > envelope.fadeOutStart) return (envelope.end - seconds) / (envelope.end - envelope.fadeOutStart);
  return 1;
}

/** Planar 32-bit float audio, the layout Mediabunny's AudioSample takes as 'f32-planar' */
export type ReelPcm = {
  data: Float32Array<ArrayBuffer>;
  sampleRate: number;
  numberOfChannels: number;
  clipSeconds: number;
  envelope: Envelope;
};

/**
 * Lays mono `samples` out for the reel: the envelope applied, cut or padded with silence to the
 * reel's length, copied to every output channel.
 */
export function shapeClip(samples: Float32Array, sampleRate: number, numberOfChannels: number, reelSeconds: number = REEL.seconds): ReelPcm {
  const clipSeconds = samples.length / sampleRate;
  const envelope = clipEnvelope(clipSeconds, reelSeconds);
  const frames = Math.round(reelSeconds * sampleRate);
  const data = new Float32Array(frames * numberOfChannels);
  const audible = Math.min(frames, samples.length);
  for (let i = 0; i < audible; i += 1) data[i] = (samples[i] ?? 0) * gainAt(envelope, i / sampleRate);
  for (let channel = 1; channel < numberOfChannels; channel += 1) data.copyWithin(channel * frames, 0, frames);
  return { data, sampleRate, numberOfChannels, clipSeconds, envelope };
}

/**
 * Decodes the clip at the encoder's rate and shapes it. Runs on the page, because decodeAudioData
 * has no worker equivalent; the browser's resampler does the 22,050 Hz to 48 kHz step (BR-19).
 */
export async function prepareClip(bytes: ArrayBuffer, sampleRate: number, numberOfChannels: number): Promise<ReelPcm> {
  const context = new OfflineAudioContext(1, 1, sampleRate);
  const decoded = await context.decodeAudioData(bytes);
  // BR-19 clips are mono; anything else is mixed down
  let mono = decoded.getChannelData(0);
  if (decoded.numberOfChannels > 1) {
    mono = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const data = decoded.getChannelData(channel);
      for (let i = 0; i < data.length; i += 1) mono[i] = (mono[i] ?? 0) + (data[i] ?? 0) / decoded.numberOfChannels;
    }
  }
  return shapeClip(mono, decoded.sampleRate, numberOfChannels);
}
