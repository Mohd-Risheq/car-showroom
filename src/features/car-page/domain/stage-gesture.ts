import {
  canZoomOut,
  clampPan,
  DOUBLE_TAP_ZOOM,
  isDoubleTap,
  isUnzoomed,
  pinchScale,
  type Point,
  type Size,
  type Tap,
  UNZOOMED,
  type Zoom,
  zoomAbout,
  zoomTo,
} from "./viewer";

// The fullscreen viewer's gestures on its photo (FR-10.4, DESIGN §7.2.4): two fingers pinch the
// photo between 1x and 3x, its point between them following them; one finger, or the mouse, pans a
// zoomed photo, held to its edges; and a double tap zooms a photo fitted whole to 2x about the
// point tapped, and a zoomed one back out. A pinch that ends a hair from 1x settles there. Pure: it
// reads each pointer as px from the screen's middle and returns the zoom it leads to, so the
// gestures are tested without a touch screen (stage-gesture.test.ts).

/** A pointer, where it is from the screen's middle, and when, as its event's timeStamp */
export type PointerAt = { readonly id: number; readonly x: number; readonly y: number; readonly time: number };

/** What a gesture reads of the viewer: the zoom shown, and the sizes of the photo and the screen */
export type Stage = { readonly zoom: Zoom; readonly fitted: Size; readonly screen: Size };

/** How far a finger may move and still tap */
export const TAP_SLOP = 10;

/** The two fingers' distance below which a pinch has nothing to scale by */
const PINCH_MIN = 1;

/** Where a gesture went from: the zoom, and where each pointer then down was */
type Origin = { readonly zoom: Zoom; readonly pointers: ReadonlyMap<number, Point> };

const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export class StageGesture {
  /** The pointers down, and where each is */
  readonly #pointers = new Map<number, Point>();
  /** Where the gesture went from, since a pointer last went down or up */
  #origin: Origin | null = null;
  /** The zoom the gesture last led to, which the viewer may not show yet */
  #latest: Zoom | null = null;
  /** The tap the gesture is while one pointer is down and hasn't moved past the slop */
  #tap: Tap | null = null;
  /** The tap before, which a second near it and soon after makes a double tap */
  #lastTap: Tap | null = null;

  down({ id, x, y, time }: PointerAt, { zoom }: Stage): void {
    this.#pointers.set(id, { x, y });
    this.#tap = this.#pointers.size === 1 ? { time, x, y } : null;
    this.#rebase(this.#latest ?? zoom);
  }

  /** The zoom a pointer's move leads to, or null where it moves nothing */
  move({ id, x, y }: PointerAt, { fitted, screen }: Stage): Zoom | null {
    const origin = this.#origin;
    if (origin === null || !this.#pointers.has(id)) return null;
    this.#pointers.set(id, { x, y });
    if (this.#tap !== null && distance(this.#tap, { x, y }) > TAP_SLOP) this.#tap = null;
    const zoom = origin.pointers.size > 1 ? this.#pinch(origin, fitted, screen) : this.#pan(origin, fitted, screen);
    if (zoom !== null) this.#latest = zoom;
    return zoom;
  }

  /** The zoom a pointer's release leads to, as a double tap's, or null where it changes nothing */
  up({ id }: PointerAt, { zoom, fitted, screen }: Stage): Zoom | null {
    if (!this.#pointers.delete(id)) return null;
    const tap = this.#tap;
    this.#tap = null;
    const shown = this.#latest ?? zoom;
    if (this.#pointers.size > 0) {
      // A finger lifted from a pinch: the one left pans on from where the photo is
      this.#rebase(shown);
      return null;
    }
    this.#origin = null;
    this.#latest = null;
    if (tap === null) {
      this.#lastTap = null;
      return canZoomOut(shown.scale) || isUnzoomed(shown) ? null : UNZOOMED;
    }
    const last = this.#lastTap;
    if (last === null || !isDoubleTap(last, tap)) {
      this.#lastTap = tap;
      return null;
    }
    this.#lastTap = null;
    return zoomTo(shown, canZoomOut(shown.scale) ? 1 : DOUBLE_TAP_ZOOM, tap, fitted, screen);
  }

  /** Drops a pointer the browser cancelled, as for a gesture of its own */
  cancel(id: number): void {
    if (!this.#pointers.delete(id)) return;
    this.#tap = null;
    if (this.#pointers.size > 0 && this.#origin !== null) {
      this.#rebase(this.#latest ?? this.#origin.zoom);
    } else {
      this.#origin = null;
      this.#latest = null;
    }
  }

  /** Lets go of every pointer and tap, as when the viewer closes or shows another photo */
  reset(): void {
    this.#pointers.clear();
    this.#origin = null;
    this.#latest = null;
    this.#tap = null;
    this.#lastTap = null;
  }

  /** The gesture goes on from the zoom given, with the pointers down where they are */
  #rebase(zoom: Zoom): void {
    this.#origin = { zoom, pointers: new Map(this.#pointers) };
  }

  /** One pointer's pan of a zoomed photo; a photo at 1x stays where it is */
  #pan({ zoom, pointers }: Origin, fitted: Size, screen: Size): Zoom | null {
    const [held] = pointers;
    if (held === undefined || !canZoomOut(zoom.scale)) return null;
    const [id, from] = held;
    const to = this.#pointers.get(id);
    if (to === undefined) return null;
    const pan = { x: zoom.pan.x + to.x - from.x, y: zoom.pan.y + to.y - from.y };
    return { scale: zoom.scale, pan: clampPan(pan, fitted, zoom.scale, screen) };
  }

  /** Two fingers' pinch: the scale by their distance, about the point between them */
  #pinch({ zoom, pointers }: Origin, fitted: Size, screen: Size): Zoom | null {
    const [first, second] = [...pointers.keys()];
    if (first === undefined || second === undefined) return null;
    const [fromA, fromB] = [pointers.get(first), pointers.get(second)];
    const [toA, toB] = [this.#pointers.get(first), this.#pointers.get(second)];
    if (!fromA || !fromB || !toA || !toB || distance(fromA, fromB) < PINCH_MIN) return null;
    const scale = pinchScale(zoom.scale, distance(fromA, fromB), distance(toA, toB));
    const [from, to] = [midpoint(fromA, fromB), midpoint(toA, toB)];
    const about = zoomAbout(zoom.pan, from, zoom.scale, scale);
    return { scale, pan: clampPan({ x: about.x + to.x - from.x, y: about.y + to.y - from.y }, fitted, scale, screen) };
  }
}
