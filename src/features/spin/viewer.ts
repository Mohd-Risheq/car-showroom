import { spring } from "motion";
import {
  backingSize,
  containRect,
  DRAG_HYSTERESIS_PX,
  dragPosition,
  FLICK_SPRING,
  frameAt,
  keyStep,
  releaseTarget,
  releaseVelocity,
  type Sample,
  type Size,
} from "./ring";
import type { FrameStore } from "./store";

// The spin viewer's engine (FR-16, DESIGN §5.4): draws pre-decoded frames on a canvas and turns
// pointer, key and button input into rotation. Per frame it writes only to the canvas, never to
// React state (DESIGN §4.7), and it draws only when the frame on screen changes.

/** FR-16.5: how long a frame rests before its high-resolution version loads */
export const REST_BEFORE_HIGH_RES_MS = 300;

export type DrawInfo = { index: number; highRes: boolean; ms: number; first: boolean };
export type ViewerOptions = {
  canvas: HTMLCanvasElement;
  store: FrameStore;
  reducedMotion: boolean;
  /** The frame on screen changed (the live frame label) */
  onFrameChange?: (index: number) => void;
  /** A pointer went down, a key or button rotated, or a flick began */
  onInteract?: () => void;
  /** The rotation came to rest on a whole frame */
  onSettle?: () => void;
  /** A release: its velocity in frames per second and the frame it will rest on */
  onRelease?: (release: { velocity: number; from: number; target: number }) => void;
  onDraw?: (draw: DrawInfo) => void;
};

type Drag = {
  pointerId: number;
  downX: number;
  downY: number;
  originX: number;
  start: number;
  active: boolean;
  samples: Sample[];
};
type Coast = { generator: ReturnType<typeof spring>; startedAt: number | null; target: number };

export class SpinViewer {
  readonly #canvas: HTMLCanvasElement;
  readonly #ctx: CanvasRenderingContext2D;
  readonly #store: FrameStore;
  readonly #options: ViewerOptions;
  readonly #resize: ResizeObserver;
  readonly #background: string;
  readonly #drawnOnce = new WeakSet<ImageBitmap>();
  #position = 0;
  #frameShown = -1;
  #drawn: ImageBitmap | null = null;
  #coast: Coast | null = null;
  #drag: Drag | null = null;
  #resting = true;
  #restTimer: ReturnType<typeof setTimeout> | undefined;
  #raf = 0;
  #cssSize: Size = { width: 0, height: 0 };
  #backing: Size = { width: 0, height: 0 };

  constructor(options: ViewerOptions) {
    this.#options = options;
    this.#canvas = options.canvas;
    this.#store = options.store;
    const ctx = this.#canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("The spin viewer needs a 2D canvas");
    this.#ctx = ctx;
    // Letterbox bars take the canvas's own background colour
    const background = getComputedStyle(this.#canvas).backgroundColor;
    this.#background = background && background !== "rgba(0, 0, 0, 0)" ? background : "#000";
    // FR-16.3: vertical page scrolling is never captured
    this.#canvas.style.touchAction = "pan-y";
    this.#canvas.addEventListener("pointerdown", this.#onPointerDown);
    this.#canvas.addEventListener("pointermove", this.#onPointerMove);
    this.#canvas.addEventListener("pointerup", this.#onPointerUp);
    this.#canvas.addEventListener("pointercancel", this.#onPointerCancel);
    this.#canvas.addEventListener("lostpointercapture", this.#onPointerCancel);
    this.#canvas.addEventListener("keydown", this.#onKeyDown);
    this.#resize = new ResizeObserver(this.#onResize);
    this.#resize.observe(this.#canvas);
  }

  get frame(): number {
    return frameAt(this.#position, this.#store.frames);
  }

  /** FR-16.4: the buttons and arrow keys step one frame (5 with Shift) with no animation */
  rotateBy(step: number): void {
    this.#options.onInteract?.();
    this.#stopCoast();
    this.#beginMoving();
    this.#position = Math.round(this.#position) + step;
    this.#schedule();
    this.#settle();
  }

  /** A release at this velocity (frames per second), as a flick would end */
  flick(velocity: number): void {
    this.#options.onInteract?.();
    this.#stopCoast();
    this.#beginMoving();
    this.#release(velocity);
  }

  /** Shows a position at once: the stress benchmark moves one frame per refresh this way */
  jumpTo(position: number): void {
    this.#stopCoast();
    this.#beginMoving();
    this.#position = position;
    this.#draw();
  }

  /** Ends a run of jumpTo calls on the nearest whole frame */
  settleNow(): void {
    this.#settle();
  }

  /** The store has new frames: draw again if they change what's on screen */
  refresh(): void {
    this.#schedule();
  }

  destroy(): void {
    cancelAnimationFrame(this.#raf);
    clearTimeout(this.#restTimer);
    this.#resize.disconnect();
    this.#canvas.removeEventListener("pointerdown", this.#onPointerDown);
    this.#canvas.removeEventListener("pointermove", this.#onPointerMove);
    this.#canvas.removeEventListener("pointerup", this.#onPointerUp);
    this.#canvas.removeEventListener("pointercancel", this.#onPointerCancel);
    this.#canvas.removeEventListener("lostpointercapture", this.#onPointerCancel);
    this.#canvas.removeEventListener("keydown", this.#onKeyDown);
  }

  #onPointerDown = (event: PointerEvent): void => {
    if (!event.isPrimary || event.button > 0) return;
    this.#canvas.setPointerCapture(event.pointerId);
    this.#options.onInteract?.();
    // A new touch catches a coast mid-flight, from the frame on screen (DESIGN §5.4)
    this.#stopCoast();
    this.#store.loadRest();
    this.#drag = {
      pointerId: event.pointerId,
      downX: event.clientX,
      downY: event.clientY,
      originX: event.clientX,
      start: this.#position,
      active: false,
      samples: [],
    };
  };

  #onPointerMove = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.active) {
      const travelX = Math.abs(event.clientX - drag.downX);
      if (travelX < DRAG_HYSTERESIS_PX || travelX < Math.abs(event.clientY - drag.downY)) return;
      // Rotation starts from here, so crossing the hysteresis doesn't jump (the grab offset)
      drag.active = true;
      drag.originX = event.clientX;
      this.#beginMoving();
    }
    this.#position = dragPosition(drag.start, event.clientX - drag.originX, this.#store.frames, this.#cssSize.width);
    drag.samples.push({ time: event.timeStamp, position: this.#position });
    if (drag.samples.length > 8) drag.samples.shift();
    this.#schedule();
  };

  #onPointerUp = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.#drag = null;
    this.#release(drag.active ? releaseVelocity(drag.samples, event.timeStamp) : 0);
  };

  #onPointerCancel = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.#drag = null;
    this.#release(0);
  };

  #onKeyDown = (event: KeyboardEvent): void => {
    const step = keyStep(event.key, event.shiftKey);
    if (!step) return;
    event.preventDefault();
    this.rotateBy(step);
  };

  #onResize = (entries: ResizeObserverEntry[]): void => {
    const box = entries[0]?.contentRect;
    if (!box || box.width === 0 || box.height === 0) return;
    this.#cssSize = { width: box.width, height: box.height };
    const backing = backingSize(box.width, box.height, window.devicePixelRatio || 1);
    if (backing.width === this.#backing.width && backing.height === this.#backing.height) return;
    this.#backing = backing;
    this.#canvas.width = backing.width;
    this.#canvas.height = backing.height;
    this.#drawn = null;
    // FR-16.1: the poster, frame 0 at display resolution, before any interaction
    if (this.#resting) this.#store.requestHigh(this.frame, backing);
    this.#schedule();
  };

  // On release: reduced motion snaps to the nearest frame (DESIGN §5.4); otherwise the flick
  // spring carries the finger's velocity to the frame nearest the projection (FR-16.2)
  #release(velocity: number): void {
    const reduced = this.#options.reducedMotion;
    const target = reduced ? Math.round(this.#position) : releaseTarget(this.#position, velocity);
    this.#options.onRelease?.({ velocity, from: this.#position, target });
    if (reduced || (velocity === 0 && target === this.#position)) {
      this.#position = target;
      this.#schedule();
      this.#settle();
      return;
    }
    this.#coast = {
      generator: spring({ keyframes: [this.#position, target], velocity, ...FLICK_SPRING }),
      startedAt: null,
      target,
    };
    this.#schedule();
  }

  #stopCoast(): void {
    this.#coast = null;
  }

  #beginMoving(): void {
    this.#resting = false;
    clearTimeout(this.#restTimer);
    this.#store.dropHigh();
    this.#store.loadRest();
  }

  #settle(): void {
    this.#position = Math.round(this.#position);
    this.#resting = true;
    clearTimeout(this.#restTimer);
    const index = this.frame;
    this.#restTimer = setTimeout(() => this.#store.requestHigh(index, this.#backing), REST_BEFORE_HIGH_RES_MS);
    this.#options.onSettle?.();
  }

  #schedule(): void {
    if (!this.#raf) this.#raf = requestAnimationFrame(this.#tick);
  }

  #tick = (now: number): void => {
    this.#raf = 0;
    const coast = this.#coast;
    if (coast) {
      coast.startedAt ??= now;
      const state = coast.generator.next(now - coast.startedAt);
      this.#position = state.done ? coast.target : state.value;
      if (state.done) {
        this.#coast = null;
        this.#draw();
        this.#settle();
        return;
      }
      this.#schedule();
    }
    this.#draw();
  };

  #draw(): void {
    const index = this.frame;
    if (index !== this.#frameShown) {
      this.#frameShown = index;
      this.#options.onFrameChange?.(index);
    }
    if (this.#backing.width === 0) return;
    const high = this.#resting ? this.#store.high(index) : undefined;
    const shown = high ? index : this.#store.nearest(index);
    const bitmap = high ?? (shown >= 0 ? this.#store.low(shown) : undefined);
    if (!bitmap || bitmap === this.#drawn) return;
    const rect = containRect(bitmap, this.#backing);
    const first = !this.#drawnOnce.has(bitmap);
    const started = performance.now();
    if (rect.x > 0 || rect.y > 0) {
      this.#ctx.fillStyle = this.#background;
      this.#ctx.fillRect(0, 0, this.#backing.width, this.#backing.height);
    }
    this.#ctx.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height);
    this.#options.onDraw?.({ index: shown, highRes: high !== undefined, ms: performance.now() - started, first });
    this.#drawnOnce.add(bitmap);
    this.#drawn = bitmap;
  }
}
