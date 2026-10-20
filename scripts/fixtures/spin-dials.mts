// The synthetic spin fixture (T-05, Q-04): numbered dial frames drawn with sharp at the BR-20
// spin sizes, for developing and measuring the spin viewer. It is written to the git-ignored
// .fixtures/spin/ folder and never ships (05-SEED-DATA §3.4).
//
// Each frame has photo-like grain under the dial, so files come close to the 28 KB cap of a
// 480 px spin frame (API-16) and decode like photos. Flat graphics would compress to a few KB
// and make the 1 MB first pass (FR-16.1) and the decode times look better than real frames.
//
// Usage: node scripts/fixtures/spin-dials.mts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

type Grain = { fine: number; coarse: number };
type FixtureSet = { name: string; frames: number; aspect: number; grain: Grain };

// Grain strength, tuned so a 480 px frame comes close to the 28 KB cap in both formats. A
// portrait frame has 1.5 times the pixels, so it gets less.
const LANDSCAPE_GRAIN: Grain = { fine: 18, coarse: 44 };
const PORTRAIT_GRAIN: Grain = { fine: 5, coarse: 18 };

// Landscape sets of 36 and 72 frames, and a portrait set for the letterbox edge case (FR-16)
const SETS: FixtureSet[] = [
  { name: "l36", frames: 36, aspect: 3 / 2, grain: LANDSCAPE_GRAIN },
  { name: "l72", frames: 72, aspect: 3 / 2, grain: LANDSCAPE_GRAIN },
  { name: "p72", frames: 72, aspect: 2 / 3, grain: PORTRAIT_GRAIN },
];
const WIDTHS = [480, 1280]; // BR-20 spin frame variants
const QUALITY = 82; // BR-20: quality 0.82
const OUT = path.join(process.cwd(), ".fixtures/spin");

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

// A dim studio: lighter wall, darker floor, a soft light in the middle, coarse and fine grain
function background(width: number, height: number, grain: Grain, seed: number): Buffer {
  const next = random(seed);
  const cell = 24;
  const cols = Math.ceil(width / cell) + 1;
  const rows = Math.ceil(height / cell) + 1;
  const coarse = Float32Array.from({ length: cols * rows }, () => next() - 0.5);
  const pixels = Buffer.alloc(width * height * 3);
  const horizon = height * 0.62;
  for (let y = 0; y < height; y++) {
    const gy = y / cell;
    const y0 = Math.floor(gy);
    const fy = gy - y0;
    for (let x = 0; x < width; x++) {
      const gx = x / cell;
      const x0 = Math.floor(gx);
      const fx = gx - x0;
      const c00 = coarse[y0 * cols + x0] ?? 0;
      const c10 = coarse[y0 * cols + x0 + 1] ?? 0;
      const c01 = coarse[(y0 + 1) * cols + x0] ?? 0;
      const c11 = coarse[(y0 + 1) * cols + x0 + 1] ?? 0;
      const blotch = (c00 * (1 - fx) + c10 * fx) * (1 - fy) + (c01 * (1 - fx) + c11 * fx) * fy;
      const dx = (x - width / 2) / width;
      const dy = (y - height / 2) / height;
      const light = 46 * Math.exp(-(dx * dx + dy * dy) * 6);
      const base = (y < horizon ? 58 : 34) + light + blotch * grain.coarse + (next() - 0.5) * grain.fine;
      const offset = (y * width + x) * 3;
      pixels[offset] = clamp(base - 4);
      pixels[offset + 1] = clamp(base);
      pixels[offset + 2] = clamp(base + 8);
    }
  }
  return pixels;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

// The dial: one tick per frame, the needle at this frame's angle (clockwise from the top, the
// way BR-17 turns the car seen from above), and the frame number in the middle
function dial(width: number, height: number, set: FixtureSet, index: number): Buffer {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.36;
  const unit = Math.min(width, height) / 320;
  const angle = (index * 360) / set.frames;
  const ticks = Array.from({ length: set.frames }, (_, k) => {
    const theta = ((k * 360) / set.frames - 90) * (Math.PI / 180);
    const inner = radius * (k % (set.frames / 12) === 0 ? 0.84 : 0.92);
    const colour = k === index ? "#f2c14e" : "#e8e4dc";
    return `<line x1="${cx + inner * Math.cos(theta)}" y1="${cy + inner * Math.sin(theta)}" x2="${cx + radius * Math.cos(theta)}" y2="${cy + radius * Math.sin(theta)}" stroke="${colour}" stroke-width="${(k === index ? 3 : 1.2) * unit}"/>`;
  }).join("");
  const theta = (angle - 90) * (Math.PI / 180);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#e8e4dc" stroke-opacity="0.55" stroke-width="${2 * unit}"/>
    ${ticks}
    <line x1="${cx}" y1="${cy}" x2="${cx + radius * 0.8 * Math.cos(theta)}" y2="${cy + radius * 0.8 * Math.sin(theta)}" stroke="#f2c14e" stroke-width="${5 * unit}" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="${7 * unit}" fill="#f2c14e"/>
    <text x="${cx}" y="${cy + radius * 0.55}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="${44 * unit}" fill="#ffffff">${String(index).padStart(2, "0")}</text>
    <text x="${cx}" y="${cy + radius * 0.55 + 20 * unit}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${12 * unit}" fill="#e8e4dc">of ${set.frames} · ${angle}°</text>
    <text x="${10 * unit}" y="${18 * unit}" font-family="Helvetica, Arial, sans-serif" font-size="${10 * unit}" fill="#e8e4dc" fill-opacity="0.8">Synthetic spin fixture (T-05), never shipped</text>
  </svg>`;
  return Buffer.from(svg);
}

type Written = { file: string; set: string; width: number; height: number; format: string; bytes: number };

async function main() {
  await mkdir(OUT, { recursive: true });
  const written: Written[] = [];
  for (const set of SETS) {
    for (const width of WIDTHS) {
      const height = Math.round(width / set.aspect);
      for (let index = 0; index < set.frames; index++) {
        const seed = (set.name.charCodeAt(0) * 7919 + set.frames * 104729 + width * 31 + index) >>> 0;
        const raw = { width, height, channels: 3 as const };
        // The composited SVG adds an alpha channel, which the encoders don't need
        const composed = await sharp(background(width, height, set.grain, seed), { raw })
          .composite([{ input: dial(width, height, set, index) }])
          .removeAlpha()
          .raw()
          .toBuffer();
        const stem = `${set.name}-${String(index).padStart(2, "0")}-${width}`;
        const encodes = [
          { format: "webp", bytes: await sharp(composed, { raw }).webp({ quality: QUALITY }).toBuffer() },
          { format: "jpg", bytes: await sharp(composed, { raw }).jpeg({ quality: QUALITY }).toBuffer() },
        ];
        for (const { format, bytes } of encodes) {
          const file = `${stem}.${format}`;
          await writeFile(path.join(OUT, file), bytes);
          written.push({ file, set: set.name, width, height, format, bytes: bytes.length });
        }
      }
    }
  }
  await writeFile(path.join(OUT, "manifest.json"), `${JSON.stringify(written, null, 2)}\n`);

  // Sizes per set, width and format, and the first pass of FR-16.1 (≤ 36 frames, ≤ 1 MB)
  for (const set of SETS) {
    for (const width of WIDTHS) {
      for (const format of ["webp", "jpg"]) {
        const sizes = written
          .filter((item) => item.set === set.name && item.width === width && item.format === format)
          .map((item) => item.bytes)
          .sort((a, b) => a - b);
        const step = set.frames / Math.min(set.frames, 36);
        const passBytes = written
          .filter((item) => item.set === set.name && item.width === width && item.format === format)
          .filter((_, k) => k % step === 0)
          .reduce((sum, item) => sum + item.bytes, 0);
        console.log(
          `${set.name} ${width} ${format}: min ${sizes[0]} B, median ${sizes[Math.floor(sizes.length / 2)]} B, max ${sizes[sizes.length - 1]} B` +
            (width === 480 ? `, first pass ${passBytes} B` : ""),
        );
      }
    }
  }
  console.log(`${written.length} files in ${path.relative(process.cwd(), OUT)}`);
}

await main();
