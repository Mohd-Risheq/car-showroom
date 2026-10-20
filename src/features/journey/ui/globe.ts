import createGlobe, { type Globe, type Marker } from "cobe";
import { angleBetween, centreOn, greatCircle, nearestTurn, type LatLng, type Vec3, toVector } from "../domain/geo";
import { easeOut, Spring } from "../domain/motion";
import { type JourneyStep, journeySteps } from "../domain/route";

// The Journey globe (FR-17, DESIGN §5.5), loaded with cobe as one lazy chunk (NFR-PERF-03). cobe 2
// draws the dotted globe and the markers. A 2D canvas over it draws the arcs and pulses: cobe gives
// every arc the same height, so the 32 km from Zarqa to Amman would stand as tall as Houston to
// Aqaba, and it cannot bring an arc in (D-031). Frames are drawn only while something moves, and
// never while the globe is off-screen or the tab is hidden (FR-17.8).

type RGB = [number, number, number];

const SPHERE = 0.8; // cobe's globe radius at scale 1, in clip-space units
// cobe's markerElevation. cobe hides a marker only when it is behind the globe and inside its disc,
// so a raised marker just over the horizon would float past the edge
const MARKER_LIFT = 0;
const MARKER_SIZE = 0.025;
const ACTIVE_MARKER_SIZE = 0.04;
const MAP_SAMPLES = 16_000;
const DIFFUSE = 0.6;
const MAX_DPR = 2;
const REVEAL_MS = 200; // --dur-pop
const PULSE_MS = 600; // --dur-reveal
const ARC_POINTS = 64;
const ARC_LIFT = 0.12; // per radian of the hop, so a short hop stays low
const MAX_ARC_LIFT = 0.2;
const ARC_ALPHA = 0.8; // arcs in --scan at 80%
const ARC_WIDTH_PX = 1.5;
const MIN_ARC_PX = 6; // a hop shorter than this on screen reads as one place, so it pulses as well
const COAST_S = 0.3; // a released drag slows with this time constant
const MAX_THETA = 1.2;
// Arcs and pulses fade out over the outer fifth of the globe's radius (a smoothstep) and never show
// past its edge, where a raised arc would stand out from the limb or loop back behind it (D-031)
const EDGE_FADE: ReadonlyArray<readonly [offset: number, alpha: number]> = [
  [0.8, 1],
  [0.85, 0.84],
  [0.9, 0.5],
  [0.95, 0.16],
  [1, 0],
];

function parseColour(value: string): RGB | null {
  const text = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text)?.[1];
  if (hex) {
    const full = hex.length === 3 ? hex.replace(/./g, "$&$&") : hex;
    return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16) / 255) as RGB;
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/i.exec(text);
  if (!rgb || (rgb[4] !== undefined && Number(rgb[4]) === 0)) return null;
  return [rgb[1], rgb[2], rgb[3]].map((channel) => Number(channel) / 255) as RGB;
}

/** The colour the globe sits on: the first ancestor with a background */
function groundOf(element: HTMLElement): RGB {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const colour = parseColour(getComputedStyle(node).backgroundColor);
    if (colour) return colour;
  }
  return [1, 1, 1];
}

/**
 * cobe's colours from the design tokens (DESIGN §5.5). In dark mode cobe shades the sphere
 * baseColor × 0.1 and a land dot baseColor × (0.1 + mapBrightness), so the sphere comes out as
 * --surface-1 and a dot as --line at 40% over it. The glow takes the ground's colour, so none shows.
 */
export function globeColours(host: HTMLElement) {
  const style = getComputedStyle(host);
  const token = (name: string) => {
    const colour = parseColour(style.getPropertyValue(name));
    if (!colour) throw new Error(`The globe needs the ${name} token`);
    return colour;
  };
  const surface = token("--surface-1");
  const line = token("--line");
  const accent = token("--scan");
  const baseColor = surface.map((channel) => channel / 0.1) as RGB;
  const ratios = baseColor
    .map((channel, i) => (channel > 1e-3 ? ((surface[i] ?? 0) * 0.6 + (line[i] ?? 0) * 0.4) / channel : null))
    .filter((ratio) => ratio !== null);
  const mapBrightness = Math.max(0, ratios.reduce((sum, ratio) => sum + ratio, 0) / Math.max(1, ratios.length) - 0.1);
  return { baseColor, mapBrightness, accent, glowColor: groundOf(host) };
}

/** cobe's rotation (its marker and arc shaders), as a function from a model point to clip space */
function rotation(phi: number, theta: number): (point: Vec3) => Vec3 {
  const [cp, sp, ct, st] = [Math.cos(phi), Math.sin(phi), Math.cos(theta), Math.sin(theta)];
  return ([x, y, z]) => [cp * x + sp * z, sp * st * x + ct * y - cp * st * z, -sp * ct * x + st * y + cp * ct * z];
}

/** An arc's points on the sphere, and how high it rises at its middle */
type Arc = { step: number; angle: number; ground: Vec3[]; lift: number; shownAt: number | null };
type Pulse = { at: Vec3; startedAt: number };
type Sample = { time: number; phi: number; theta: number };

export type JourneyGlobeOptions = {
  /** Each milestone's place, in milestone order (BR-10) */
  places: ReadonlyArray<LatLng | null>;
  /** The active milestone, or -1 for none yet */
  active: number;
  /** The WebGL context was lost: show the static map instead (FR-17 error states) */
  onFail?: () => void;
  /** After each frame, with the main-thread time it took (spike T-09's meter) */
  onFrame?: (cpuMs: number) => void;
  /** When nothing moves any more and the loop stops */
  onSettle?: () => void;
};

export interface GlobeHandle {
  activate(index: number): void;
  destroy(): void;
}

class GlobeView implements GlobeHandle {
  readonly #host: HTMLElement;
  readonly #canvas: HTMLCanvasElement;
  /** Owns every listener the view adds; destroy() aborts it, and nothing draws after that */
  readonly #lifetime = new AbortController();
  readonly #options: JourneyGlobeOptions;
  readonly #steps: JourneyStep[];
  readonly #arcs: Arc[];
  readonly #pulses: Pulse[] = [];
  readonly #globe: Globe;
  readonly #overlay: HTMLCanvasElement;
  readonly #context: CanvasRenderingContext2D;
  readonly #accent: string;
  #ink!: CanvasGradient;
  readonly #phi: Spring;
  readonly #theta: Spring;
  readonly #resize: ResizeObserver;
  readonly #presence: IntersectionObserver;
  #size: number;
  #dpr: number;
  #active = -1;
  #frame = 0;
  #lastFrameAt = -1;
  #onScreen = false;
  #pointer: { id: number; x: number; y: number; samples: Sample[] } | null = null;
  #coast: { phi: number; theta: number } | null = null;

  constructor(host: HTMLElement, canvas: HTMLCanvasElement, globe: Globe, size: number, dpr: number, accent: RGB, options: JourneyGlobeOptions) {
    this.#host = host;
    this.#canvas = canvas;
    this.#options = options;
    this.#globe = globe;
    this.#size = size;
    this.#dpr = dpr;
    this.#accent = accent.map((channel) => Math.round(channel * 255)).join(",");
    this.#steps = journeySteps(options.places);
    this.#arcs = this.#steps.flatMap((step) => {
      if (step.kind !== "arc") return [];
      const angle = angleBetween(step.from, step.place);
      const lift = Math.min(MAX_ARC_LIFT, ARC_LIFT * angle);
      return [{ step: step.index, angle, ground: greatCircle(step.from, step.place, ARC_POINTS), lift, shownAt: null }];
    });

    const start = centreOn(this.#placeAtOrBefore(options.active) ?? this.#firstPlace());
    this.#phi = new Spring(start.phi);
    this.#theta = new Spring(start.theta);

    this.#overlay = document.createElement("canvas");
    this.#overlay.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
    canvas.parentElement?.append(this.#overlay);
    const context = this.#overlay.getContext("2d");
    if (!context) throw new Error("No 2D canvas for the globe's arcs");
    this.#context = context;
    this.#sizeOverlay();

    this.#reveal(options.active, false);
    host.style.touchAction = "pan-y";
    const { signal } = this.#lifetime;
    host.addEventListener("pointerdown", this.#down, { signal });
    host.addEventListener("pointermove", this.#move, { signal });
    host.addEventListener("pointerup", this.#up, { signal });
    host.addEventListener("pointercancel", this.#up, { signal });
    canvas.addEventListener("webglcontextlost", this.#lost, { signal });
    document.addEventListener("visibilitychange", this.#wake, { signal });
    this.#resize = new ResizeObserver(() => this.#fit());
    this.#resize.observe(host);
    this.#presence = new IntersectionObserver((entries) => {
      this.#onScreen = entries.some((entry) => entry.isIntersecting);
      this.#wake();
    });
    this.#presence.observe(host);
  }

  activate(index: number): void {
    const next = Math.max(-1, Math.min(index, this.#steps.length - 1));
    if (next === this.#active) return;
    this.#reveal(next, next > this.#active);
    const place = this.#placeAtOrBefore(next);
    if (place) {
      // Selecting a milestone takes over from a drag, keeping the globe's speed (DESIGN §4.1)
      const target = centreOn(place);
      if (this.#coast) {
        this.#phi.velocity = this.#coast.phi;
        this.#theta.velocity = this.#coast.theta;
        this.#coast = null;
      }
      this.#pointer = null;
      this.#phi.target = nearestTurn(this.#phi.value, target.phi);
      this.#theta.target = target.theta;
    }
    this.#wake();
  }

  /** cobe doesn't draw again when its map texture arrives, so the view does */
  redrawOnLoad(texture: HTMLImageElement): void {
    if (!texture.complete) texture.addEventListener("load", this.#wake, { once: true, signal: this.#lifetime.signal });
  }

  destroy(): void {
    this.#lifetime.abort();
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    this.#resize.disconnect();
    this.#presence.disconnect();
    this.#globe.destroy();
    releaseContext(this.#canvas);
    this.#host.style.touchAction = "";
    this.#host.replaceChildren();
  }

  #firstPlace(): LatLng {
    const first = this.#options.places.find((place) => place !== null);
    if (!first) throw new Error("The globe needs a place");
    return first;
  }

  #placeAtOrBefore(index: number): LatLng | null {
    for (let i = index; i >= 0; i -= 1) {
      const place = this.#options.places[i];
      if (place) return place;
    }
    return null;
  }

  /** Shows the arcs and markers up to `index`; when moving forward, the step's own arc comes in */
  #reveal(index: number, animate: boolean): void {
    const now = performance.now();
    this.#active = index;
    for (const arc of this.#arcs) {
      if (arc.step > index) arc.shownAt = null;
      else if (arc.shownAt === null) arc.shownAt = animate && arc.step === index ? now : Number.NEGATIVE_INFINITY;
    }
    const step = this.#steps[index];
    if (animate && step && step.kind !== "unplaced" && step.kind !== "start") {
      const tiny = step.kind === "pulse" || this.#arcPixels(angleBetween(step.from, step.place)) < MIN_ARC_PX;
      if (tiny) this.#pulses.push({ at: this.#lift(step.place), startedAt: now });
    }
    const markers: Marker[] = [];
    const seen = new Set<string>();
    const activePlace = this.#placeAtOrBefore(index);
    for (const shown of this.#steps.slice(0, index + 1)) {
      if (shown.kind === "unplaced" || seen.has(shown.place.join())) continue;
      seen.add(shown.place.join());
      const active = activePlace?.[0] === shown.place[0] && activePlace[1] === shown.place[1];
      markers.push({ location: [shown.place[0], shown.place[1]], size: active ? ACTIVE_MARKER_SIZE : MARKER_SIZE });
    }
    this.#globe.update({ markers });
  }

  #lift(place: LatLng): Vec3 {
    const [x, y, z] = toVector(place);
    const radius = SPHERE + MARKER_LIFT;
    return [x * radius, y * radius, z * radius];
  }

  /** How long a hop of `angle` radians is on screen, seen from straight above */
  #arcPixels(angle: number): number {
    return 2 * Math.sin(angle / 2) * SPHERE * (this.#size / 2);
  }

  /** Asks for a frame, or stops asking while the globe is off-screen or the tab hidden (FR-17.8) */
  #wake = (): void => {
    if (this.#lifetime.signal.aborted) return;
    if (!this.#onScreen || document.hidden) {
      cancelAnimationFrame(this.#frame);
      this.#frame = 0;
      this.#lastFrameAt = -1;
    } else if (!this.#frame) {
      this.#frame = requestAnimationFrame(this.#draw);
    }
  };

  #draw = (now: number): void => {
    this.#frame = 0;
    const began = performance.now();
    const dt = this.#lastFrameAt < 0 ? 1 / 60 : Math.min(0.05, (now - this.#lastFrameAt) / 1000);
    this.#lastFrameAt = now;
    // While a pointer holds the globe, each of its moves asks for a frame
    let moving = false;
    if (this.#coast) {
      const decay = Math.exp(-dt / COAST_S);
      this.#phi.value += this.#coast.phi * dt;
      this.#theta.value = Math.max(-MAX_THETA, Math.min(MAX_THETA, this.#theta.value + this.#coast.theta * dt));
      this.#coast = { phi: this.#coast.phi * decay, theta: this.#coast.theta * decay };
      if (Math.hypot(this.#coast.phi, this.#coast.theta) < 0.02) this.#coast = null;
      this.#phi.halt();
      this.#theta.halt();
      moving = this.#coast !== null;
    } else if (!this.#pointer) {
      const phiSettled = this.#phi.step(dt);
      const thetaSettled = this.#theta.step(dt);
      moving = !phiSettled || !thetaSettled;
    }
    this.#globe.update({ phi: this.#phi.value, theta: this.#theta.value });
    const animating = this.#drawOverlay(now);
    this.#options.onFrame?.(performance.now() - began);
    if (moving || animating) this.#wake();
    else {
      this.#lastFrameAt = -1;
      this.#options.onSettle?.();
    }
  };

  /** Draws the arcs and pulses for this frame, and reports whether any is still animating */
  #drawOverlay(now: number): boolean {
    const context = this.#context;
    const scale = (this.#size * this.#dpr) / 2;
    const turn = rotation(this.#phi.value, this.#theta.value);
    const toScreen = (point: Vec3): [number, number] | null => {
      const [x, y, z] = turn(point);
      // Hidden behind the sphere, as cobe's own shaders decide it
      if (z < 0 && x * x + y * y < SPHERE * SPHERE) return null;
      return [(x + 1) * scale, (1 - y) * scale];
    };
    let animating = false;
    context.clearRect(0, 0, this.#overlay.width, this.#overlay.height);
    context.strokeStyle = this.#ink;
    context.lineWidth = ARC_WIDTH_PX * this.#dpr;
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const arc of this.#arcs) {
      if (arc.shownAt === null) continue;
      const progress = Math.min(1, (now - arc.shownAt) / REVEAL_MS);
      if (progress < 1) animating = true;
      // The arc comes in with opacity and scale (DESIGN §5.5): it rises from the ground to its height
      const eased = easeOut(progress);
      context.globalAlpha = ARC_ALPHA * eased;
      context.beginPath();
      let drawing = false;
      for (let i = 0; i <= ARC_POINTS; i += 1) {
        const point = arc.ground[i];
        const radius = SPHERE + MARKER_LIFT + arc.lift * eased * Math.sin((Math.PI * i) / ARC_POINTS);
        const screen = point && toScreen([point[0] * radius, point[1] * radius, point[2] * radius]);
        if (!screen) {
          drawing = false;
          continue;
        }
        if (drawing) context.lineTo(screen[0], screen[1]);
        else context.moveTo(screen[0], screen[1]);
        drawing = true;
      }
      context.stroke();
    }
    for (let i = this.#pulses.length - 1; i >= 0; i -= 1) {
      const pulse = this.#pulses[i];
      const progress = pulse ? (now - pulse.startedAt) / PULSE_MS : 1;
      if (!pulse || progress >= 1) {
        this.#pulses.splice(i, 1);
        continue;
      }
      animating = true;
      const screen = toScreen(pulse.at);
      if (!screen) continue;
      const eased = easeOut(progress);
      context.globalAlpha = ARC_ALPHA * (1 - eased);
      context.beginPath();
      context.arc(screen[0], screen[1], (3 + 12 * eased) * this.#dpr, 0, 2 * Math.PI);
      context.stroke();
    }
    return animating;
  }

  #sizeOverlay(): void {
    const pixels = Math.round(this.#size * this.#dpr);
    this.#overlay.width = pixels;
    this.#overlay.height = pixels;
    const centre = pixels / 2;
    this.#ink = this.#context.createRadialGradient(centre, centre, 0, centre, centre, SPHERE * centre);
    for (const [offset, alpha] of EDGE_FADE) this.#ink.addColorStop(offset, `rgba(${this.#accent},${alpha})`);
  }

  #fit(): void {
    const size = this.#host.clientWidth;
    if (size === 0 || size === this.#size) return;
    this.#size = size;
    this.#globe.update({ width: size, height: size });
    this.#sizeOverlay();
    this.#wake();
  }

  #down = (event: PointerEvent): void => {
    if (!event.isPrimary || event.button > 0) return;
    this.#host.setPointerCapture(event.pointerId);
    // A drag stops any rotation at once (DESIGN §5.5)
    this.#coast = null;
    this.#phi.halt();
    this.#theta.halt();
    const sample = { time: event.timeStamp, phi: this.#phi.value, theta: this.#theta.value };
    this.#pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, samples: [sample] };
    this.#wake();
  };

  #move = (event: PointerEvent): void => {
    const pointer = this.#pointer;
    if (!pointer || event.pointerId !== pointer.id) return;
    // The surface at the middle of the globe stays under the pointer
    const radiansPerPixel = 1 / (SPHERE * (this.#size / 2));
    this.#phi.value += (event.clientX - pointer.x) * radiansPerPixel;
    this.#theta.value = Math.max(-MAX_THETA, Math.min(MAX_THETA, this.#theta.value + (event.clientY - pointer.y) * radiansPerPixel));
    this.#phi.halt();
    this.#theta.halt();
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.samples.push({ time: event.timeStamp, phi: this.#phi.value, theta: this.#theta.value });
    while (pointer.samples.length > 2 && event.timeStamp - (pointer.samples[0]?.time ?? 0) > 100) pointer.samples.shift();
    this.#wake();
  };

  #up = (event: PointerEvent): void => {
    const pointer = this.#pointer;
    if (!pointer || event.pointerId !== pointer.id) return;
    this.#pointer = null;
    const first = pointer.samples[0];
    const last = pointer.samples.at(-1);
    const seconds = first && last ? (last.time - first.time) / 1000 : 0;
    // A release after a pause, or a cancelled pointer, leaves the globe where it is
    if (event.type === "pointerup" && first && last && seconds > 0 && event.timeStamp - last.time < 50) {
      this.#coast = { phi: (last.phi - first.phi) / seconds, theta: (last.theta - first.theta) / seconds };
    }
    this.#wake();
  };

  #lost = (): void => {
    this.#options.onFail?.();
  };
}

/** cobe's destroy() deletes its buffers and programs but keeps the context, so release it now, not at GC */
function releaseContext(canvas: HTMLCanvasElement): void {
  (canvas.getContext("webgl2") ?? canvas.getContext("webgl"))?.getExtension("WEBGL_lose_context")?.loseContext();
}

/**
 * Mounts the globe in `host`, an empty square element that the caller sizes, or returns null
 * when the browser has no WebGL (FR-17.6): the caller then keeps the static map.
 */
export function mountJourneyGlobe(host: HTMLElement, options: JourneyGlobeOptions): GlobeHandle | null {
  const size = host.clientWidth;
  const first = options.places.find((place) => place !== null);
  if (size === 0 || !first) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const colours = globeColours(host);
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display:block;width:100%;height:100%";
  host.append(canvas);

  // cobe loads its land texture as an image and doesn't draw again when it arrives, so catch
  // that image while cobe is created (synchronously) and draw once more when it loads
  const NativeImage = window.Image;
  let texture: HTMLImageElement | null = null;
  window.Image = class extends NativeImage {
    constructor(width?: number, height?: number) {
      super(width, height);
      texture ??= this;
    }
  };
  let globe: Globe;
  try {
    const start = centreOn(first);
    globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width: size,
      height: size,
      phi: start.phi,
      theta: start.theta,
      dark: 1,
      diffuse: DIFFUSE,
      mapSamples: MAP_SAMPLES,
      mapBrightness: colours.mapBrightness,
      mapBaseBrightness: 0,
      baseColor: colours.baseColor,
      markerColor: colours.accent,
      glowColor: colours.glowColor,
      markerElevation: MARKER_LIFT,
      context: { powerPreference: "low-power" },
    });
  } catch (error) {
    host.replaceChildren();
    throw error;
  } finally {
    window.Image = NativeImage;
  }
  // Without a WebGL context or with a shader that fails to compile, cobe returns a globe that does
  // nothing, before it wraps the canvas in its own element
  if (canvas.parentElement === host) {
    globe.destroy();
    host.replaceChildren();
    return null;
  }
  // A failure leaves nothing behind, so the caller only has to keep its static map
  let view: GlobeView;
  try {
    view = new GlobeView(host, canvas, globe, size, dpr, colours.accent, options);
  } catch (error) {
    globe.destroy();
    releaseContext(canvas);
    host.replaceChildren();
    throw error;
  }
  const arrived = texture as HTMLImageElement | null;
  if (arrived) view.redrawOnLoad(arrived);
  return view;
}
