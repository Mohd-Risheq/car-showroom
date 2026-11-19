import { FLICK_SPEED, projection } from "@/lib/motion/drag-release";
import { type Spring, SPRINGS } from "@/lib/motion-tokens";
import { type KeyPress, nextSide } from "./gallery";

// The fullscreen viewer's geometry (FR-10, DESIGN §7.2.4): the photos it holds, the one in view and
// the one each side of it; a photo fitted whole to the screen, as a portrait one letterboxes; zoom
// up to 3x by pinch, double tap and the zoom buttons (FR-10.4, SC 2.5.1); a zoomed photo's pan by a
// drag or the arrow keys, which never shows past its edges; and a swipe, which steps through the
// photos in the reading direction (DESIGN §4.6) and takes a drag's flick (§6.1, drag-release.ts).
// Pure, so the gestures are tested without a touch screen. Points and pans are px from the screen's
// middle, x to the right and y down.

export type Size = { readonly width: number; readonly height: number };
export type Point = { readonly x: number; readonly y: number };

/** FR-10.4's largest zoom */
export const MAX_ZOOM = 3;

/** The zoom buttons' steps */
const ZOOM_STEPS = [1, 2, MAX_ZOOM] as const;

/** The zoom a double tap takes a photo fitted whole to */
export const DOUBLE_TAP_ZOOM = 2;

/** How near a step a scale counts as on it, so a pinch just short of a step takes no tiny step */
const AT_STEP = 0.01;

/** A second tap this soon after the first, and this near it, is a double tap */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 24;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** A photo the viewer holds: its place in the set, and its place from the one in view */
export type Slot = { readonly index: number; readonly offset: -1 | 0 | 1 };

/**
 * The photos the viewer holds: the one in view, and the one each side of it, which a swipe brings
 * in and whose files load ahead (FR-10.5)
 */
export function slotsAround(index: number, count: number): Slot[] {
  return ([-1, 0, 1] as const)
    .map((offset) => ({ index: index + offset, offset }))
    .filter((slot) => slot.index >= 0 && slot.index < count);
}

/** The photo's size fitted whole inside the screen: letterboxed, never cropped */
export function fitRect(photo: Size, screen: Size): Size {
  // A photo wider than the screen's shape takes its width, else its height
  if (photo.width * screen.height >= screen.width * photo.height) {
    return { width: screen.width, height: (screen.width * photo.height) / photo.width };
  }
  return { width: (screen.height * photo.width) / photo.height, height: screen.height };
}

/** A photo's zoom: its scale, and its pan from the screen's middle */
export type Zoom = { readonly scale: number; readonly pan: Point };

/** A photo fitted whole to the screen */
export const UNZOOMED: Zoom = { scale: 1, pan: { x: 0, y: 0 } };

/** Whether the zoom shows the photo fitted whole: at 1x, unpanned, whichever object holds it */
export const isUnzoomed = ({ scale, pan }: Zoom) => scale === 1 && pan.x === 0 && pan.y === 0;

/** Whether the zoom-in button can go further: not at 3x, nor a hair short of it */
export function canZoomIn(scale: number): boolean {
  return scale < MAX_ZOOM - AT_STEP;
}

/** Whether the zoom-out button can go further: not at 1x, nor a hair past it */
export function canZoomOut(scale: number): boolean {
  return scale > 1 + AT_STEP;
}

/** The zoom-in button's next step from the scale */
export function zoomIn(scale: number): number {
  return ZOOM_STEPS.find((step) => step > scale + AT_STEP) ?? MAX_ZOOM;
}

/** The zoom-out button's next step from the scale */
export function zoomOut(scale: number): number {
  return ZOOM_STEPS.findLast((step) => step < scale - AT_STEP) ?? 1;
}

/** A pinch's scale: the one it started at, times how far the fingers moved apart, from 1x to 3x */
export function pinchScale(startScale: number, startDistance: number, distance: number): number {
  return clamp((startScale * distance) / startDistance, 1, MAX_ZOOM);
}

/** The pan that keeps the photo's point under the finger where it is as the scale changes */
export function zoomAbout(pan: Point, point: Point, from: number, to: number): Point {
  const ratio = to / from;
  return { x: point.x - (point.x - pan.x) * ratio, y: point.y - (point.y - pan.y) * ratio };
}

/**
 * The zoom at a scale about a point, as the buttons zoom about the screen's middle and a double tap
 * about the point tapped: the photo's point there stays, and the pan is held to the photo's edges
 */
export function zoomTo(zoom: Zoom, scale: number, point: Point, fitted: Size, screen: Size): Zoom {
  return { scale, pan: clampPan(zoomAbout(zoom.pan, point, zoom.scale, scale), fitted, scale, screen) };
}

/**
 * A zoomed photo's pan, held where its edges stay outside the screen's, and in the middle across a
 * side the photo fits in
 */
export function clampPan(pan: Point, fitted: Size, scale: number, screen: Size): Point {
  const hold = (value: number, photo: number, room: number) => {
    const reach = (photo * scale - room) / 2;
    return reach > 0 ? clamp(value, -reach, reach) : 0;
  };
  return { x: hold(pan.x, fitted.width, screen.width), y: hold(pan.y, fitted.height, screen.height) };
}

/** An arrow key moves a zoomed photo a tenth of the screen's side: ten presses cross it */
const KEY_PRESSES_ACROSS = 10;

/** The way each arrow key moves a zoomed photo: against the key, so the side it names comes in */
const KEY_PANS = new Map<string, Point>([
  ["ArrowLeft", { x: 1, y: 0 }],
  ["ArrowRight", { x: -1, y: 0 }],
  ["ArrowUp", { x: 0, y: 1 }],
  ["ArrowDown", { x: 0, y: -1 }],
]);

/**
 * The zoom an arrow key gives a zoomed photo, whose arrows look around it rather than step (the
 * owner, 2026-11-09): the side of the photo the key names comes into view, the same in Arabic, as a
 * drag moves the photo itself, and the pan is held to the photo's edges. An arrow that can't move
 * it still counts, so a zoomed photo never steps. Null at 1x, for another key, and for an arrow
 * held with Alt, Ctrl or Cmd, which is the browser's or the system's.
 */
export function panFromKey(
  { key, altKey, ctrlKey, metaKey }: KeyPress,
  zoom: Zoom,
  fitted: Size,
  screen: Size,
): Zoom | null {
  const way = KEY_PANS.get(key);
  if (way === undefined || altKey || ctrlKey || metaKey || !canZoomOut(zoom.scale)) return null;
  const pan = {
    x: zoom.pan.x + (way.x * screen.width) / KEY_PRESSES_ACROSS,
    y: zoom.pan.y + (way.y * screen.height) / KEY_PRESSES_ACROSS,
  };
  return { scale: zoom.scale, pan: clampPan(pan, fitted, zoom.scale, screen) };
}

/** A tap, when and where it was: the pointer event's timeStamp, and its point */
export type Tap = { readonly time: number; readonly x: number; readonly y: number };

/** Whether the second tap makes a double tap with the first */
export function isDoubleTap(first: Tap, second: Tap): boolean {
  return (
    second.time - first.time <= DOUBLE_TAP_MS && Math.hypot(second.x - first.x, second.y - first.y) <= DOUBLE_TAP_PX
  );
}

/**
 * Where a released sideways drag takes the viewer: on to the next photo when the photo went against
 * the reading direction, the way the next comes in from, past half the screen or with a flick; back
 * when it went the other way; else nowhere. The offset and velocity are px and px/s to the right.
 */
export function swipeStep(offset: number, velocity: number, width: number, dir: "rtl" | "ltr"): -1 | 0 | 1 {
  // The photo goes away from the side the next one waits on, as that one comes in
  const onward = -nextSide(dir);
  const travel = offset * onward;
  const speed = velocity * onward;
  const rest = travel + projection(speed);
  if (speed > FLICK_SPEED || rest > width / 2) return 1;
  if (speed < -FLICK_SPEED || rest < -width / 2) return -1;
  return 0;
}

/** The spring released photos settle on: DESIGN §4.3's flick after real momentum, else its move */
export function settleSpring(velocity: number): Spring {
  return Math.abs(velocity) > FLICK_SPEED ? SPRINGS.flick : SPRINGS.move;
}
