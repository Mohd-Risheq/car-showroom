// Reel It (FR-43): what this browser can encode, found by feature detection only, never from the
// user agent (SRS §10.8). A browser without the H.264 config gets FR-43.1's message instead of the
// button; one without the AAC config makes a silent reel and says so (FR-43.3).

/** BR-39 and DESIGN §5.16. MB is binary, as everywhere in the app (D-023). */
export const REEL = {
  width: 1080,
  height: 1920,
  fps: 30,
  frames: 450,
  seconds: 15,
  videoBitrate: 8_000_000,
  maxBytes: 20 * 1024 * 1024,
} as const;

/**
 * H.264 High profile at level 4.0, then the nearest levels above it (BR-39). 1080 × 1920 is 8,160
 * macroblocks, 244,800 a second at 30 fps: inside level 4.0's 8,192 and 245,760, so no lower level
 * fits. No lower profile is on the ladder, because BR-39 names High.
 */
export const VIDEO_CODECS = [
  "avc1.640028",
  "avc1.640029",
  "avc1.64002a",
  "avc1.640032",
  "avc1.640033",
  "avc1.640034",
] as const;

/**
 * AAC-LC (mp4a.40.2) at 48 or 44.1 kHz. The clips are 22,050 Hz (BR-19), a rate at which
 * Mediabunny would pick HE-AAC, so the page resamples them first (prepare-clip.ts).
 */
export const AUDIO_CONFIGS = [
  { codec: "mp4a.40.2", sampleRate: 48_000, numberOfChannels: 2, bitrate: 128_000 },
  { codec: "mp4a.40.2", sampleRate: 48_000, numberOfChannels: 1, bitrate: 96_000 },
  { codec: "mp4a.40.2", sampleRate: 44_100, numberOfChannels: 2, bitrate: 128_000 },
  { codec: "mp4a.40.2", sampleRate: 44_100, numberOfChannels: 1, bitrate: 96_000 },
] as const satisfies readonly AudioEncoderConfig[];

export type AudioChoice = (typeof AUDIO_CONFIGS)[number];
export type BitrateMode = "variable" | "constant";

/** The config Mediabunny gives VideoEncoder for a reel (its buildVideoEncoderConfigs), so the check asks the same question */
export function videoConfig(codec: string, bitrateMode: BitrateMode = "variable"): VideoEncoderConfig {
  return {
    codec,
    width: REEL.width,
    height: REEL.height,
    bitrate: REEL.videoBitrate,
    bitrateMode,
    alpha: "discard",
    framerate: REEL.fps,
    avc: { format: "avc" },
  };
}

type Check<C> = (config: C) => Promise<{ supported?: boolean | undefined }>;

export type Encoders = {
  VideoEncoder?: { isConfigSupported: Check<VideoEncoderConfig> };
  AudioEncoder?: { isConfigSupported: Check<AudioEncoderConfig> };
};

/** Whether `check` says yes. A throw counts as no: browsers throw a TypeError for a config they can't parse. */
export async function isSupported<C>(check: Check<C> | undefined, config: C): Promise<boolean> {
  if (!check) return false;
  try {
    return (await check(config)).supported === true;
  } catch {
    return false;
  }
}

/** FR-43.1: the first codec on BR-39's ladder this browser encodes at 1080 × 1920 and 30 fps, or null */
export async function pickVideoCodec(
  scope: Encoders = globalThis as Encoders,
  bitrateMode: BitrateMode = "variable",
): Promise<string | null> {
  const encoder = scope.VideoEncoder;
  const check = encoder ? encoder.isConfigSupported.bind(encoder) : undefined;
  for (const codec of VIDEO_CODECS) {
    if (await isSupported(check, videoConfig(codec, bitrateMode))) return codec;
  }
  return null;
}

/** FR-43.3: the first AAC config this browser encodes, or null for a silent reel */
export async function pickAudioConfig(scope: Encoders = globalThis as Encoders): Promise<AudioChoice | null> {
  const encoder = scope.AudioEncoder;
  const check = encoder ? encoder.isConfigSupported.bind(encoder) : undefined;
  for (const config of AUDIO_CONFIGS) {
    if (await isSupported(check, config)) return config;
  }
  return null;
}
