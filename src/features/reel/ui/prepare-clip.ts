import { type ReelPcm, shapeClip } from "../domain/clip";

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
