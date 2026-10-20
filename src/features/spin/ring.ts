// The spin viewer's maths (FR-16, BR-17, DESIGN §5.4), with no DOM so the viewer and its tests
// share it. Positions are in frames and unbounded: 37.25 is a quarter past frame 1 on the
// second turn. Nothing here reads the page direction, so rotation is the same in both locales.

export type Size = { width: number; height: number };
export type Rect = Size & { x: number; y: number };
export type Sample = { time: number; position: number };

/** The ring's index for any integer, negatives included */
export function wrapFrame(index: number, frames: number): number {
  return ((index % frames) + frames) % frames;
}

/** The frame a position shows: the nearest whole frame */
export function frameAt(position: number, frames: number): number {
  return wrapFrame(Math.round(position), frames);
}

/** FR-16.2: one frame per width / (frames × 0.66) px of horizontal travel */
export function pixelsPerFrame(width: number, frames: number): number {
  return width / (frames * 0.66);
}

/** Pointer travel before a drag starts rotating (DESIGN §5.4) */
export const DRAG_HYSTERESIS_PX = 10;

/** BR-17: moving toward the physical right (increasing x) shows the next frames */
export function dragPosition(startPosition: number, travelX: number, frames: number, width: number): number {
  return startPosition + travelX / pixelsPerFrame(width, frames);
}

/** FR-16.4: the Right arrow shows the next frame and the Left arrow the previous; Shift moves 5 */
export function keyStep(key: string, shiftKey: boolean): number {
  const step = shiftKey ? 5 : 1;
  if (key === "ArrowRight") return step;
  if (key === "ArrowLeft") return -step;
  return 0;
}

/** DESIGN §5.4: velocity from the last 5 samples. Samples older than this before the release
 * don't count, so a finger that stopped before lifting releases with no velocity. */
export const VELOCITY_SAMPLES = 5;
export const VELOCITY_WINDOW_MS = 100;

/** Release velocity in frames per second */
export function releaseVelocity(samples: readonly Sample[], releaseTime: number): number {
  const recent = samples.filter((sample) => releaseTime - sample.time <= VELOCITY_WINDOW_MS).slice(-VELOCITY_SAMPLES);
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (!first || !last || last.time <= first.time) return 0;
  return ((last.position - first.position) / (last.time - first.time)) * 1000;
}

/** DESIGN §5.4: the release projects to current + (v / 1000) · d / (1 − d), with d = 0.998 */
export const DECELERATION_RATE = 0.998;

export function projectRelease(position: number, velocity: number): number {
  return position + (velocity / 1000) * (DECELERATION_RATE / (1 - DECELERATION_RATE));
}

/** FR-16.2: the whole frame nearest the projection, where the rotation comes to rest */
export function releaseTarget(position: number, velocity: number): number {
  return Math.round(projectRelease(position, velocity));
}

/** The `flick` spring (DESIGN §4.3: bounce 0.2, duration 0.4 s) as the stiffness and damping
 * Motion resolves it to. Motion 14 drops the release velocity on springs defined by duration,
 * so the viewer passes these with the velocity instead (DECISIONS.md D-027). */
export const FLICK_SPRING = { stiffness: 505.61, damping: 35.977, mass: 1 } as const;

/** FR-16.1: the first pass loads at most this many evenly spaced low-resolution frames */
export const FIRST_PASS_MAX = 36;

/** The positions 0 to count − 1 in an order that keeps spreading them round the ring: 0, the
 * opposite side, the two quarters, and so on, so any prefix covers the ring evenly */
export function spreadOrder(count: number): number[] {
  if (count <= 0) return [];
  const order = [0];
  const queue: Array<[number, number]> = [[0, count]];
  for (let next = queue.shift(); next; next = queue.shift()) {
    const [start, end] = next;
    if (end - start < 2) continue;
    const middle = Math.floor((start + end) / 2);
    order.push(middle);
    queue.push([start, middle], [middle, end]);
  }
  return order;
}

/** FR-16.1: the first pass (≤ 36 evenly spaced frames) and, for larger sets, the frames that
 * load on the first interaction, each in spread order */
export function loadOrder(frames: number): { firstPass: number[]; rest: number[] } {
  const passCount = Math.min(frames, FIRST_PASS_MAX);
  const firstPass = spreadOrder(passCount).map((step) => Math.round((step * frames) / passCount));
  const inFirstPass = new Set(firstPass);
  const rest = spreadOrder(frames).filter((index) => !inFirstPass.has(index));
  return { firstPass, rest };
}

/** FR-16.9: the loaded frame nearest a target, searching both ways round the ring; −1 if none */
export function nearestLoaded(target: number, frames: number, isLoaded: (index: number) => boolean): number {
  const start = wrapFrame(target, frames);
  for (let offset = 0; offset <= frames / 2; offset++) {
    const ahead = wrapFrame(start + offset, frames);
    if (isLoaded(ahead)) return ahead;
    const behind = wrapFrame(start - offset, frames);
    if (isLoaded(behind)) return behind;
  }
  return -1;
}

/** The size an image decodes at to fit inside a box, never upscaled. Portrait frames in the 3:2
 * viewer decode at the letterboxed size, which keeps 72 frames inside NFR-PERF-07 (D-027). */
export function fitInside(source: Size, box: Size): Size {
  const scale = Math.min(1, box.width / source.width, box.height / source.height);
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
}

/** Where an image is drawn in a box: centred, as large as fits, letterboxed (contain) */
export function containRect(source: Size, box: Size): Rect {
  const scale = Math.min(box.width / source.width, box.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
}

/** BR-20: the high-resolution frame width, which also caps the canvas (FR-16 edge case: 4K) */
export const HIGH_RES_WIDTH = 1280;

/** Canvas pixels for a viewer box: CSS size × device pixel ratio, at most 1280 px wide */
export function backingSize(cssWidth: number, cssHeight: number, devicePixelRatio: number): Size {
  const width = Math.max(1, Math.min(Math.round(cssWidth * devicePixelRatio), HIGH_RES_WIDTH));
  return { width, height: Math.max(1, Math.round((width * cssHeight) / cssWidth)) };
}

/** Decoded size of a bitmap: 4 bytes per pixel (NFR-PERF-07) */
export function bitmapBytes(size: Size): number {
  return size.width * size.height * 4;
}
