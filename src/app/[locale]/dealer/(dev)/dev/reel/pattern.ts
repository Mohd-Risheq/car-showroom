import { REEL } from "@/features/reel/support";

// Spike T-08's test pattern: frames made for the checks, not a reel (T-66 draws DESIGN §5.16's
// template). Every frame has:
// - an index strip, the frame number in 10 black or white blocks, read back from the file to find
//   dropped, repeated or reordered frames;
// - a detailed picture that keeps zooming in and panning, harder on the encoder than the
//   template's photo push-in, for the 8 Mbps target and the 20 MB cap;
// - colour patches with known values, to check the file's colour tags;
// - a sync bar, white for the first 3 frames of every 2 seconds, where the step clips change level.

const GRAPHITE = "#1c1d1f";

export const PATTERN = {
  strip: { band: { y: 40, height: 120 }, y: 60, size: 80, x: 40, pitch: 100, bits: 10 },
  sync: { x: 40, y: 190, width: 1000, height: 50, everyFrames: 60, litFrames: 3 },
  picture: { y: 300, width: 1080, height: 1260, zoomTo: 1.1, margin: 1.1 },
  label: { x: 40, y: 1650 },
  patches: [
    { name: "white", rgb: [255, 255, 255] },
    { name: "black", rgb: [0, 0, 0] },
    { name: "grey", rgb: [128, 128, 128] },
    { name: "red", rgb: [200, 40, 40] },
    { name: "green", rgb: [40, 160, 80] },
    { name: "blue", rgb: [40, 80, 200] },
    { name: "amber", rgb: [230, 170, 40] },
  ],
  patch: { y: 1700, size: 110, x: 40, pitch: 145 },
} as const;

export type Picture = OffscreenCanvas;

// The same small seeded generator as the clip fixtures, so every engine draws the same picture
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth noise from -1 to 1 with features about `spacing` pixels across */
function noise(width: number, height: number, spacing: number, next: () => number): Float32Array {
  const columns = Math.ceil(width / spacing) + 2;
  const rows = Math.ceil(height / spacing) + 2;
  const grid = Float32Array.from({ length: columns * rows }, () => next() * 2 - 1);
  const out = new Float32Array(width * height);
  const ease = (x: number) => x * x * (3 - 2 * x);
  for (let y = 0; y < height; y += 1) {
    const gy = y / spacing;
    const row = Math.floor(gy);
    const fy = ease(gy - row);
    for (let x = 0; x < width; x += 1) {
      const gx = x / spacing;
      const column = Math.floor(gx);
      const fx = ease(gx - column);
      const i = row * columns + column;
      const top = (grid[i] ?? 0) + ((grid[i + 1] ?? 0) - (grid[i] ?? 0)) * fx;
      const bottom = (grid[i + columns] ?? 0) + ((grid[i + columns + 1] ?? 0) - (grid[i + columns] ?? 0)) * fx;
      out[y * width + x] = top + (bottom - top) * fy;
    }
  }
  return out;
}

/** A photo-like picture: broad light, texture at three scales, grain, and hard edges on top */
export function makePicture(): Picture {
  const { width: w, height: h, margin } = PATTERN.picture;
  const width = Math.round(w * margin);
  const height = Math.round(h * margin);
  const next = random(0x7e08);
  const broad = noise(width, height, 160, next);
  const mid = noise(width, height, 28, next);
  const fine = noise(width, height, 5, next);
  const image = new ImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    const sky = y / height;
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const texture = 40 * (broad[i] ?? 0) + 34 * (mid[i] ?? 0) + 24 * (fine[i] ?? 0) + 12 * (next() * 2 - 1);
      const p = i * 4;
      image.data[p] = 70 + 110 * sky + texture + 30 * (broad[i] ?? 0);
      image.data[p + 1] = 90 + 70 * sky + texture;
      image.data[p + 2] = 140 - 60 * sky + texture - 25 * (mid[i] ?? 0);
      image.data[p + 3] = 255;
    }
  }
  const picture = new OffscreenCanvas(width, height);
  const ctx = picture.getContext("2d");
  if (!ctx) throw new Error("no 2D context for the picture");
  ctx.putImageData(image, 0, 0);
  for (let i = 0; i < 160; i += 1) {
    ctx.strokeStyle = `hsl(${Math.round(next() * 360)} 60% ${Math.round(20 + next() * 60)}%)`;
    ctx.lineWidth = 1 + next() * 4;
    ctx.beginPath();
    ctx.moveTo(next() * width, next() * height);
    ctx.lineTo(next() * width, next() * height);
    ctx.stroke();
  }
  for (let i = 0; i < 40; i += 1) {
    ctx.fillStyle = `hsl(${Math.round(next() * 360)} 50% ${Math.round(15 + next() * 70)}% / 0.6)`;
    ctx.beginPath();
    ctx.ellipse(next() * width, next() * height, 10 + next() * 90, 10 + next() * 60, next() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  return picture;
}

/** The frame number a strip of `bits` blocks shows, most significant block first */
export function stripBits(index: number): number[] {
  return Array.from({ length: PATTERN.strip.bits }, (_, k) => (index >> (PATTERN.strip.bits - 1 - k)) & 1);
}

export function drawPattern(ctx: OffscreenCanvasRenderingContext2D, index: number, picture: Picture): void {
  const { strip, sync, picture: area, label, patches, patch } = PATTERN;
  ctx.fillStyle = GRAPHITE;
  ctx.fillRect(0, 0, REEL.width, REEL.height);

  // Zoom from the whole picture to its centre 1/1.1, panning across, so every pixel changes
  const progress = index / (REEL.frames - 1);
  const zoom = 1 + (area.zoomTo - 1) * progress;
  const sw = picture.width / zoom;
  const sh = picture.height / zoom;
  const sx = (picture.width - sw) * (0.5 + 0.4 * Math.sin(progress * Math.PI * 2));
  const sy = (picture.height - sh) / 2;
  ctx.drawImage(picture, sx, sy, sw, sh, 0, area.y, area.width, area.height);

  ctx.fillStyle = "rgb(96 96 96)";
  ctx.fillRect(0, strip.band.y, REEL.width, strip.band.height);
  stripBits(index).forEach((bit, k) => {
    ctx.fillStyle = bit ? "#fff" : "#000";
    ctx.fillRect(strip.x + k * strip.pitch, strip.y, strip.size, strip.size);
  });

  ctx.fillStyle = index % sync.everyFrames < sync.litFrames ? "#fff" : "rgb(40 40 40)";
  ctx.fillRect(sync.x, sync.y, sync.width, sync.height);

  ctx.fillStyle = "#fff";
  ctx.font = "600 44px sans-serif";
  ctx.direction = "ltr";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`Muftah T-08 test pattern, frame ${index}, ${(index / REEL.fps).toFixed(3)} s`, label.x, label.y);

  patches.forEach(({ rgb }, k) => {
    ctx.fillStyle = `rgb(${rgb.join(" ")})`;
    ctx.fillRect(patch.x + k * patch.pitch, patch.y, patch.size, patch.size);
  });
}
