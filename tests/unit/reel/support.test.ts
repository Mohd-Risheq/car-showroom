import { describe, expect, it } from "vitest";
import { AUDIO_CONFIGS, type Encoders, pickAudioConfig, pickVideoCodec, REEL, VIDEO_CODECS, videoConfig } from "@/features/reel/support";

// FR-43.1, FR-43.3, BR-39 and SRS §10.8: what Reel It offers, found by feature detection only

/** A browser whose encoders say yes to `yes`, and record every config they were asked about */
function browser(yes: { video?: string[]; audio?: Array<{ codec: string; sampleRate: number; numberOfChannels: number }> }) {
  const asked: { video: VideoEncoderConfig[]; audio: AudioEncoderConfig[] } = { video: [], audio: [] };
  const scope: Encoders = {
    VideoEncoder: {
      isConfigSupported: async (config) => {
        asked.video.push(config);
        return { supported: (yes.video ?? []).includes(config.codec) };
      },
    },
    AudioEncoder: {
      isConfigSupported: async (config) => {
        asked.audio.push(config);
        const match = (yes.audio ?? []).some(
          (a) => a.codec === config.codec && a.sampleRate === config.sampleRate && a.numberOfChannels === config.numberOfChannels,
        );
        return { supported: match };
      },
    },
  };
  return { scope, asked };
}

describe("the reel's numbers", () => {
  it("is 15 s at 30 fps, 1080 × 1920, 8 Mbps, capped at 20 MB in binary units (BR-39, D-023)", () => {
    expect(REEL.frames).toBe(REEL.fps * REEL.seconds);
    expect([REEL.width, REEL.height]).toEqual([1080, 1920]);
    expect(REEL.videoBitrate).toBe(8_000_000);
    expect(REEL.maxBytes).toBe(20_971_520);
  });

  it("asks for portrait H.264 in avc format, the config Mediabunny encodes with", () => {
    expect(videoConfig("avc1.640028")).toEqual({
      codec: "avc1.640028",
      width: 1080,
      height: 1920,
      bitrate: 8_000_000,
      bitrateMode: "variable",
      alpha: "discard",
      framerate: 30,
      avc: { format: "avc" },
    });
    expect(videoConfig("avc1.640028", "constant").bitrateMode).toBe("constant");
  });
});

describe("pickVideoCodec (FR-43.1, BR-39)", () => {
  it("hides the feature when the browser has no VideoEncoder", async () => {
    expect(await pickVideoCodec({})).toBeNull();
  });

  it("picks High profile at level 4.0 first", async () => {
    const { scope, asked } = browser({ video: [...VIDEO_CODECS] });
    expect(await pickVideoCodec(scope)).toBe("avc1.640028");
    expect(asked.video).toHaveLength(1);
  });

  it("climbs to the nearest supported level above 4.0", async () => {
    const { scope, asked } = browser({ video: ["avc1.640032", "avc1.640033"] });
    expect(await pickVideoCodec(scope)).toBe("avc1.640032");
    expect(asked.video.map((c) => c.codec)).toEqual(["avc1.640028", "avc1.640029", "avc1.64002a", "avc1.640032"]);
  });

  it("never falls back to a lower profile", async () => {
    const { scope } = browser({ video: ["avc1.4d0028", "avc1.42e028"] });
    expect(await pickVideoCodec(scope)).toBeNull();
  });

  it("treats a throwing check as unsupported and goes on", async () => {
    const scope: Encoders = {
      VideoEncoder: {
        isConfigSupported: async (config) => {
          if (config.codec === "avc1.640028") throw new TypeError("unparsable");
          return { supported: config.codec === "avc1.640029" };
        },
      },
    };
    expect(await pickVideoCodec(scope)).toBe("avc1.640029");
  });

  it("passes the bitrate mode through", async () => {
    const { scope, asked } = browser({ video: ["avc1.640028"] });
    await pickVideoCodec(scope, "constant");
    expect(asked.video[0]?.bitrateMode).toBe("constant");
  });
});

describe("pickAudioConfig (FR-43.3)", () => {
  it("makes a silent reel when the browser has no AudioEncoder, as Safari 16.4 to 25 has none", async () => {
    expect(await pickAudioConfig({})).toBeNull();
  });

  it("picks AAC-LC at 48 kHz in stereo first", async () => {
    const { scope } = browser({ audio: [...AUDIO_CONFIGS] });
    expect(await pickAudioConfig(scope)).toEqual({ codec: "mp4a.40.2", sampleRate: 48_000, numberOfChannels: 2, bitrate: 128_000 });
  });

  it("falls back to mono, then to 44.1 kHz", async () => {
    const mono = browser({ audio: [{ codec: "mp4a.40.2", sampleRate: 48_000, numberOfChannels: 1 }] });
    expect((await pickAudioConfig(mono.scope))?.numberOfChannels).toBe(1);
    const cd = browser({ audio: [{ codec: "mp4a.40.2", sampleRate: 44_100, numberOfChannels: 2 }] });
    expect((await pickAudioConfig(cd.scope))?.sampleRate).toBe(44_100);
  });

  it("only ever asks for AAC-LC, never HE-AAC at the clip's own 22,050 Hz", async () => {
    const { scope, asked } = browser({});
    expect(await pickAudioConfig(scope)).toBeNull();
    expect(new Set(asked.audio.map((c) => c.codec))).toEqual(new Set(["mp4a.40.2"]));
    expect(asked.audio.every((c) => c.sampleRate >= 44_100)).toBe(true);
  });
});
