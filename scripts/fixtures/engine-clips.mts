// Synthetic engine clips (T-07, Q-04): generated, not recorded, in BR-19's output format (mono,
// 22,050 Hz, 16-bit WAV, peak at -1 dBFS, plus 200 peaks), so a phone decodes exactly what
// production serves. They are written to the git-ignored .fixtures/sound/ folder and never ship
// (05-SEED-DATA §3.5 has the real clips).
//
// - steps-8s: four 2-second loudness steps (-14, -2, -14 and -8 dB), to check that the needle
//   follows the analyser;
// - idle-12s: a steady idle with a slow wobble, for FR-15's "settles around the idle position";
// - rev-6s: idle, a rev to 5,000 rpm and back.
// - steps-20s: ten 2-second steps, longer than a reel, so T-08 can check the cut and fade-out
//   at 15 s (DESIGN §5.16).
//
// The sound is firing pulses through two resonances, with a low rumble under them. Phone speakers
// play little below 200 Hz, so the pulses carry most of what a phone can reproduce.
//
// Usage: node scripts/fixtures/engine-clips.mts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const RATE = 22_050; // BR-19
const PEAK_DBFS = -1; // BR-19
const PEAKS = 200; // BR-19
const OUT = path.join(process.cwd(), ".fixtures/sound");

type Clip = {
  name: string;
  clipType: "cold_start" | "idle" | "rev";
  seconds: number;
  /** Engine speed in rpm at time t */
  rpm: (t: number) => number;
  /** Loudness in dB at time t, before the clip is normalized */
  gainDb: (t: number) => number;
  /** How much each firing's strength varies, from 0 (none) */
  jitter: number;
  /** The noise generator's seed: a clip's own, so adding or moving clips changes no other */
  seed: number;
};

// A small seeded generator, so the fixture is the same on every machine
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A two-pole resonance at `frequency` Hz that rings for about `decay` seconds */
function resonator(frequency: number, decay: number): (input: number) => number {
  const r = Math.exp(-1 / (decay * RATE));
  const a1 = 2 * r * Math.cos((2 * Math.PI * frequency) / RATE);
  const a2 = -r * r;
  let y1 = 0;
  let y2 = 0;
  return (input) => {
    const y = input + a1 * y1 + a2 * y2;
    y2 = y1;
    y1 = y;
    return y;
  };
}

// Steps of `seconds` each, crossfaded over 30 ms in decibels so the steps don't click
function steps(levels: number[], seconds: number): (t: number) => number {
  const fade = 0.03;
  return (t) => {
    const index = Math.min(levels.length - 1, Math.floor(t / seconds));
    const into = t - index * seconds;
    const level = levels[index] ?? 0;
    const previous = levels[index - 1];
    if (previous === undefined || into >= fade) return level;
    return previous + (level - previous) * (into / fade);
  };
}

const smoothstep = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

function revRpm(t: number): number {
  if (t < 1) return 800;
  if (t < 2.5) return 800 + 4200 * smoothstep((t - 1) / 1.5);
  if (t < 3) return 5000;
  return 800 + 4200 * Math.exp(-(t - 3) / 0.5);
}

const CLIPS: Clip[] = [
  {
    name: "steps-8s",
    seed: 0x7007,
    clipType: "idle",
    seconds: 8,
    rpm: () => 800,
    gainDb: steps([-14, -2, -14, -8], 2),
    // Even firings, so each step holds one level
    jitter: 0,
  },
  {
    name: "idle-12s",
    seed: 0x7008,
    clipType: "idle",
    seconds: 12,
    rpm: (t) => 800 + 15 * Math.sin(2 * Math.PI * 0.7 * t),
    gainDb: (t) => -6 + 1.5 * Math.sin(2 * Math.PI * 0.5 * t),
    jitter: 0.4,
  },
  {
    name: "rev-6s",
    seed: 0x7009,
    clipType: "rev",
    seconds: 6,
    rpm: revRpm,
    // Louder as it revs
    gainDb: (t) => -14 + 12 * ((revRpm(t) - 800) / 4200),
    jitter: 0.4,
  },
  {
    name: "steps-20s",
    seed: 0x700a,
    clipType: "idle",
    seconds: 20,
    rpm: () => 800,
    // Every edge changes by 8 dB or more, so each one can be found in the reel's audio
    gainDb: steps([-14, -2, -14, -6, -14, -2, -10, -2, -14, -6], 2),
    jitter: 0,
  },
];

function synthesize(clip: Clip): Float32Array {
  const next = random(clip.seed);
  const length = Math.round(clip.seconds * RATE);
  const samples = new Float32Array(length);
  const body = resonator(170, 0.012);
  const rasp = resonator(720, 0.004);
  // Each firing excites the resonances with a short noise burst. With no jitter, every burst is
  // the same one, so the clip's loudness changes only where gainDb says.
  const burst = Array.from({ length: Math.round(0.012 * RATE) }, () => next() * 2 - 1);
  let phase = 0;
  let rumble = 0;
  let strength = 0;
  let sinceFiring = burst.length;
  for (let i = 0; i < length; i += 1) {
    const t = i / RATE;
    // Four cylinders, four strokes: two firings per revolution
    const firing = (clip.rpm(t) / 60) * 2;
    phase += firing / RATE;
    let impulse = 0;
    if (phase >= 1) {
      phase -= 1;
      strength = 1 + clip.jitter * (next() - 0.5);
      impulse = strength;
      sinceFiring = 0;
    }
    let noise = 0;
    if (sinceFiring < burst.length) {
      const shape = clip.jitter > 0 ? next() * 2 - 1 : (burst[sinceFiring] ?? 0);
      noise = shape * strength * Math.exp(-sinceFiring / (0.002 * RATE));
      sinceFiring += 1;
    }
    rumble += (2 * Math.PI * firing) / RATE;
    const sound = 0.02 * body(impulse + noise) + 0.012 * rasp(noise) + 0.25 * Math.sin(rumble) + 0.1 * Math.sin(2 * rumble);
    // 50 ms fades at both ends, as the trimmed clips have no click
    const edge = Math.min(1, t / 0.05, (clip.seconds - t) / 0.05);
    samples[i] = sound * 10 ** (clip.gainDb(t) / 20) * edge;
  }
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const scale = 10 ** (PEAK_DBFS / 20) / peak;
  for (let i = 0; i < length; i += 1) samples[i] = (samples[i] ?? 0) * scale;
  return samples;
}

function wav(samples: Float32Array): Buffer {
  const data = samples.length * 2;
  const out = Buffer.alloc(44 + data);
  out.write("RIFF", 0, "ascii");
  out.writeUInt32LE(36 + data, 4);
  out.write("WAVE", 8, "ascii");
  out.write("fmt ", 12, "ascii");
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20); // PCM
  out.writeUInt16LE(1, 22); // mono
  out.writeUInt32LE(RATE, 24);
  out.writeUInt32LE(RATE * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36, "ascii");
  out.writeUInt32LE(data, 40);
  samples.forEach((sample, i) => {
    out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), 44 + i * 2);
  });
  return out;
}

function peaks(samples: Float32Array): number[] {
  const size = samples.length / PEAKS;
  return Array.from({ length: PEAKS }, (_, bucket) => {
    let peak = 0;
    for (let i = Math.floor(bucket * size); i < Math.floor((bucket + 1) * size); i += 1) {
      peak = Math.max(peak, Math.abs(samples[i] ?? 0));
    }
    return Math.round(peak * 1000) / 1000;
  });
}

await mkdir(OUT, { recursive: true });
const manifest = [];
for (const clip of CLIPS) {
  const samples = synthesize(clip);
  const file = `${clip.name}.wav`;
  const bytes = wav(samples);
  await writeFile(path.join(OUT, file), bytes);
  manifest.push({ file, clipType: clip.clipType, durationMs: clip.seconds * 1000, sampleRate: RATE, peaks: peaks(samples) });
  console.log(`${file}: ${bytes.length} B, ${clip.seconds} s`);
}
await writeFile(path.join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
