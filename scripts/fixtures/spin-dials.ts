// The synthetic spin fixture (T-05, Q-04): numbered dial frames drawn with sharp at the BR-20
// spin sizes, for developing and measuring the spin viewer. It is written to the git-ignored
// .fixtures/spin/ folder and never ships (05-SEED-DATA §3.4). The sets, sizes and file names come
// from the fixture catalogue, src/app/_dev/fixtures.ts.
//
// Each frame has photo-like grain under the dial, so files come close to the 28 KB cap of a
// 480 px spin frame (API-16) and decode like photos. Flat graphics would compress to a few KB
// and make the 1 MB first pass (FR-16.1) and the decode times look better than real frames. The
// script exits 1 when a frame is over its cap or a first pass over 1 MB.
//
// Usage: pnpm fixtures:spin
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  SPIN_FOLDER,
  SPIN_FORMATS,
  SPIN_SETS,
  SPIN_WIDTHS,
  type SpinFormat,
  type SpinSetName,
  spinFrameFile,
  spinFrameSize,
} from "../../src/app/_dev/fixtures.ts";
import { loadOrder } from "../../src/features/spin/domain/ring.ts";
import { seededRandom } from "../../src/lib/seeded-random.ts";
import { maxBytesFor } from "../../src/lib/storage/rules.ts";

type Grain = { fine: number; coarse: number };

// Grain strength, tuned so a 480 px frame comes close to the 28 KB cap in both formats. A
// portrait frame has 1.5 times the pixels, so it gets less.
const LANDSCAPE_GRAIN: Grain = { fine: 18, coarse: 44 };
const PORTRAIT_GRAIN: Grain = { fine: 5, coarse: 18 };
const GRAIN: Record<SpinSetName, Grain> = { l36: LANDSCAPE_GRAIN, l72: LANDSCAPE_GRAIN, p72: PORTRAIT_GRAIN };

const WIDTHS = [SPIN_WIDTHS.low, SPIN_WIDTHS.high];
const QUALITY = 82; // BR-20: quality 0.82
const FIRST_PASS_MAX_BYTES = 1024 * 1024; // FR-16.1: 1 MB, in the binary units of D-022
const OUT = path.join(import.meta.dirname, "../..", SPIN_FOLDER);

// A dim studio: lighter wall, darker floor, a soft light in the middle, coarse and fine grain
function background(width: number, height: number, grain: Grain, seed: number): Buffer {
  const next = seededRandom(seed);
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
function dial(width: number, height: number, frames: number, index: number): Buffer {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.36;
  const unit = Math.min(width, height) / 320;
  const angle = (index * 360) / frames;
  const ticks = Array.from({ length: frames }, (_, k) => {
    const theta = ((k * 360) / frames - 90) * (Math.PI / 180);
    const inner = radius * (k % (frames / 12) === 0 ? 0.84 : 0.92);
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
    <text x="${cx}" y="${cy + radius * 0.55 + 20 * unit}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${12 * unit}" fill="#e8e4dc">of ${frames} · ${angle}°</text>
    <text x="${10 * unit}" y="${18 * unit}" font-family="Helvetica, Arial, sans-serif" font-size="${10 * unit}" fill="#e8e4dc" fill-opacity="0.8">Synthetic spin fixture (T-05), never shipped</text>
  </svg>`;
  return Buffer.from(svg);
}

type Written = { file: string; set: SpinSetName; width: number; height: number; format: SpinFormat; bytes: number };

async function writeFrames(): Promise<Written[]> {
  await mkdir(OUT, { recursive: true });
  const written: Written[] = [];
  for (const set of Object.keys(SPIN_SETS) as SpinSetName[]) {
    const { frames } = SPIN_SETS[set];
    for (const width of WIDTHS) {
      const { height } = spinFrameSize(set, width);
      for (let index = 0; index < frames; index++) {
        const seed = (set.charCodeAt(0) * 7919 + frames * 104729 + width * 31 + index) >>> 0;
        const raw = { width, height, channels: 3 as const };
        // The composited SVG adds an alpha channel, which the encoders don't need
        const composed = await sharp(background(width, height, GRAIN[set], seed), { raw })
          .composite([{ input: dial(width, height, frames, index) }])
          .removeAlpha()
          .raw()
          .toBuffer();
        for (const format of SPIN_FORMATS) {
          const encoder = sharp(composed, { raw });
          const bytes = await (
            format === "webp" ? encoder.webp({ quality: QUALITY }) : encoder.jpeg({ quality: QUALITY })
          ).toBuffer();
          const file = spinFrameFile(set, index, width, format);
          await writeFile(path.join(OUT, file), bytes);
          written.push({ file, set, width, height, format, bytes: bytes.length });
        }
      }
    }
  }
  await writeFile(path.join(OUT, "manifest.json"), `${JSON.stringify(written, null, 2)}\n`);
  return written;
}

// Sizes per set, width and format, and the first pass of FR-16.1 in the viewer's load order.
// Returns the frames and first passes over their caps.
function report(written: Written[]): string[] {
  const over: string[] = [];
  for (const item of written) {
    const cap = maxBytesFor("spin_frame", String(item.width), item.format, { demo: false });
    if (cap === undefined) over.push(`${item.file}: BR-20 has no ${item.width} px spin frame`);
    else if (item.bytes > cap) over.push(`${item.file}: ${item.bytes} B, over the ${cap} B cap (API-16)`);
  }
  for (const set of Object.keys(SPIN_SETS) as SpinSetName[]) {
    const { firstPass } = loadOrder(SPIN_SETS[set].frames);
    for (const width of WIDTHS) {
      for (const format of SPIN_FORMATS) {
        const files = written.filter((item) => item.set === set && item.width === width && item.format === format);
        const sizes = files.map((item) => item.bytes).sort((a, b) => a - b);
        let line = `${set} ${width} ${format}: min ${sizes[0]} B, median ${sizes[Math.floor(sizes.length / 2)]} B, max ${sizes.at(-1)} B`;
        if (width === SPIN_WIDTHS.low) {
          const frameBytes = (index: number) => {
            const file = spinFrameFile(set, index, width, format);
            const frame = files.find((item) => item.file === file);
            if (frame === undefined) throw new Error(`${file} is in the first pass but wasn't written`);
            return frame.bytes;
          };
          const passBytes = firstPass.reduce((sum, index) => sum + frameBytes(index), 0);
          line += `, first pass ${passBytes} B`;
          if (passBytes > FIRST_PASS_MAX_BYTES) {
            over.push(`${set} ${format}: first pass ${passBytes} B, over 1 MB (FR-16.1)`);
          }
        }
        console.log(line);
      }
    }
  }
  return over;
}

const written = await writeFrames();
const over = report(written);
console.log(`${written.length} files in ${SPIN_FOLDER}`);
for (const problem of over) console.error(problem);
if (over.length > 0) process.exitCode = 1;
