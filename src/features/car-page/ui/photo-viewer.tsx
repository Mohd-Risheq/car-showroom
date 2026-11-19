"use client";

import { Dialog } from "@base-ui/react/dialog";
import {
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { FILLED_CHIP } from "@/components/ui/chip-classes";
import { type Input, inputOf, inputOfClick } from "@/components/ui/dialog-input";
import { CaretLeftIcon } from "@/components/ui/icons/caret-left";
import { CaretRightIcon } from "@/components/ui/icons/caret-right";
import { MagnifyingGlassMinusIcon } from "@/components/ui/icons/magnifying-glass-minus";
import { MagnifyingGlassPlusIcon } from "@/components/ui/icons/magnifying-glass-plus";
import { XIcon } from "@/components/ui/icons/x";
import { Photo } from "@/components/ui/photo";
import { cn } from "@/lib/class-names";
import { directionOf } from "@/lib/i18n/locales";
import { nextSide, photosBeside, stepFromKey, stepTo } from "../domain/gallery";
import type { Stage } from "../domain/stage-gesture";
import type { SwipeEnd } from "../domain/swipe-gesture";
import {
  canZoomIn,
  canZoomOut,
  fitRect,
  isUnzoomed,
  panFromKey,
  settleSpring,
  type Size,
  type Slot,
  slotsAround,
  UNZOOMED,
  type Zoom,
  zoomIn,
  zoomOut,
  zoomTo,
} from "../domain/viewer";
import type { GalleryPhoto, ViewerWords } from "./photo-gallery";
import { CarPhoto, frameColor, PhotoCount, PhotoThumbnail } from "./photo-parts";
import { useStageGestures } from "./stage-gestures";
import { AT_REST, TrackMotion } from "./track-motion";

// FR-10's fullscreen viewer (SCR-04, DESIGN §7.2.4), whose code the gallery loads when a finger or
// the focus lands on what opens it (photo-gallery.tsx). Base UI's Dialog traps the focus, locks the
// page's scroll and hides the page from assistive technology. The group of the photo in view names
// the viewer, and its title takes the focus as the viewer opens (DESIGN §8.4), which goes back to
// what opened it as it closes (FR-10.7). It holds the photo in view, fitted whole to the screen,
// and the one each side of it, whose files load ahead (FR-10.5). Previous and next, at the screen's
// sides, and the arrow keys step through the photos in the reading direction (FR-10.3), at once,
// and each photo they bring in is announced (DESIGN §8.3). On a touch screen a swipe across brings
// in the photo beside it, unannounced, the photos following the finger and settling on a spring
// (track-motion.ts), and a swipe down closes the viewer (swipe-gesture.ts). The zoom buttons, a
// pinch and a double tap zoom the photo up to 3x, and a drag pans it once zoomed
// (stage-gesture.ts), as the photo's largest file comes in over it (FR-10.4). The arrow keys pan a
// zoomed photo too, rather than step, except in the strip, whose arrows go from thumbnail to
// thumbnail as previous and next go from photo to photo (the owner, 2026-11-09); each photo it
// steps to, and each open, starts fitted whole. An imperfection photo's caption, over its foot,
// carries the chip Imperfection and the dealer's note (DESIGN §7.2.4). The viewer fades in over
// --dur-modal as its photo grows to its size, and out over --dur-pop; from the keyboard it shows
// and leaves at once, as a zoom button pressed from the keyboard zooms at once (DESIGN §4.2), and
// with reduced motion it only fades (DESIGN §4.5).

export type PhotoViewerProps = {
  /** The photos the gallery shows: every photo, or the chosen group's */
  photos: readonly GalleryPhoto[];
  /** The photo in view, from the viewer's first open */
  at: string | undefined;
  /** Called with the photo a step brings in */
  onAtChange: (at: string) => void;
  /** How the visitor opened the viewer */
  input: Input;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What opened the viewer, which the focus goes back to when it closes (FR-10.7) */
  finalFocus: RefObject<HTMLElement | null>;
  words: ViewerWords;
  dir: "rtl" | "ltr";
  /** The photos whose files didn't load, which show as neutral tiles (photo-parts.tsx) */
  broken: ReadonlySet<string>;
  /** Called with a photo whose file didn't load */
  onBroken: (id: string) => void;
};

/** The photo's zoom, and whether the change to it glides: a gesture's moves and a key's don't */
type Zoomed = { readonly zoom: Zoom; readonly glide: boolean };

const FITTED: Zoomed = { zoom: UNZOOMED, glide: false };

/** The zoom buttons zoom about the screen's middle */
const MIDDLE = { x: 0, y: 0 };

/** A thumbnail's width in the strip, as its class and, for the browser's pick of a file, as sizes */
const STRIP_THUMBNAIL = { width: "w-24", sizes: "6rem" } as const;

export function PhotoViewer({
  photos,
  at,
  onAtChange,
  input,
  open,
  onOpenChange,
  finalFocus,
  words,
  dir,
  broken,
  onBroken,
}: PhotoViewerProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  /** How the visitor closed the viewer */
  const [closedBy, setClosedBy] = useState<Input>("pointer");
  /** The photo a button or a key brought in last, announced while it shows (DESIGN §8.3) */
  const [announced, setAnnounced] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState<Zoomed>(FITTED);
  /** Whether the viewer was open as it last rendered: each open starts its photo fitted whole */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setZoomed(FITTED);
  }
  const actions = useRef<Dialog.Root.Actions>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  /** The photos' motion as they follow a swipe, while the viewer is on the screen */
  const motion = useRef<TrackMotion | null>(null);
  const track = useCallback((element: HTMLDivElement | null) => {
    if (element === null) return;
    const moving = new TrackMotion(element, backdrop);
    motion.current = moving;
    return () => {
      // A settle that would end after the viewer has gone steps nowhere
      moving.reset();
      motion.current = null;
    };
  }, []);
  /** Whether the viewer is open, which a settle that arrives late reads */
  const live = useRef(open);
  useLayoutEffect(() => {
    live.current = open;
  }, [open]);
  /** The size of the stage, which each photo is fitted to */
  const [screen, setScreen] = useState<Size | null>(null);
  const index = Math.max(
    photos.findIndex(({ id }) => id === at),
    0,
  );
  const photo = photos[index];
  const beside = photosBeside(index, photos.length);
  const instant = (open ? input : closedBy) === "keyboard";
  const strip = useRef<HTMLUListElement>(null);
  const { zoom } = zoomed;
  /** What the gestures and the keys read of the stage, or null before it is measured */
  const stage = photo === undefined || screen === null ? null : { zoom, fitted: fitRect(photo, screen), screen };
  const { reset: resetGestures, handlers } = useStageGestures({
    stage,
    around: { dir, ...beside },
    onZoom: (to, glide) => setZoomed({ zoom: to, glide }),
    onDrag: ({ axis, offset }) => motion.current?.drag(axis === "across" ? { x: offset, y: 0 } : { x: 0, y: offset }),
    onLand: () => motion.current?.land(),
    onSettle: settle,
  });
  const measured = useRef<Size | null>(null);
  const measureStage = useCallback(
    (element: HTMLDivElement | null) => {
      if (element === null) return;
      // The layout's size, which the photo's entrance scale leaves alone. A zoomed photo starts
      // over, fitted whole to a new size, as when the phone turns.
      const measure = () => {
        const { clientWidth: width, clientHeight: height } = element;
        if (measured.current?.width === width && measured.current.height === height) return;
        measured.current = { width, height };
        resetGestures();
        motion.current?.reset();
        setZoomed(FITTED);
        setScreen({ width, height });
      };
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    },
    [resetGestures],
  );

  function onChange(next: boolean, details: Dialog.Root.ChangeEventDetails) {
    if (!next) {
      setClosedBy(inputOf(details) ?? "pointer");
      setAnnounced(null);
      // The photo leaves as it is, zoomed, falling from a swipe down or not, and the next open starts
      // it fitted whole
      resetGestures();
    }
    onOpenChange(next);
  }

  /** Brings in a photo, which starts fitted whole */
  function bringIn(next: GalleryPhoto) {
    onAtChange(next.id);
    resetGestures();
    setZoomed(FITTED);
  }

  /** A button's, a key's or a thumbnail's photo: the photos rest at once, and it is announced */
  function choose(next: GalleryPhoto | undefined) {
    if (next === undefined || next === photo) return;
    motion.current?.reset();
    bringIn(next);
    setAnnounced(next.id);
  }

  function step(move: number) {
    choose(photos[stepTo(index, move, photos.length)]);
  }

  /** Where a released swipe takes the photos: on to the next or back, out of the viewer or back */
  function settle(end: SwipeEnd, { screen: size }: Stage) {
    const moving = motion.current;
    if (moving === null) return;
    const spring = settleSpring(end.velocity);
    if (end.axis === "down" && end.closes) {
      // The photo goes on down as the viewer fades
      moving.settle({ x: 0, y: size.height }, end.velocity, spring);
      actions.current?.close();
    } else if (end.axis === "across" && end.move !== 0) {
      // The photos go a screen away from the side the photo they bring in waits on (nextSide)
      const next = photos[stepTo(index, end.move, photos.length)];
      moving.settle({ x: -end.move * nextSide(dir) * size.width, y: 0 }, end.velocity, spring, () => {
        if (!live.current || next === undefined) return;
        // A photo a swipe brings in is no announcement (DESIGN §8.3)
        flushSync(() => {
          bringIn(next);
          setAnnounced(null);
        });
        moving.reset();
      });
    } else {
      moving.settle(AT_REST, end.velocity, spring);
    }
  }

  function zoomBy(scaleFrom: (scale: number) => number, event: MouseEvent<HTMLButtonElement>) {
    if (stage === null) return;
    const to = zoomTo(zoom, scaleFrom(zoom.scale), MIDDLE, stage.fitted, stage.screen);
    // From the keyboard the photo zooms at once
    setZoomed({ zoom: to, glide: inputOfClick(event) === "pointer" });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const inStrip = event.target instanceof Node && strip.current?.contains(event.target) === true;
    const pan = stage === null || inStrip ? null : panFromKey(event, stage.zoom, stage.fitted, stage.screen);
    if (pan !== null) {
      event.preventDefault();
      setZoomed({ zoom: pan, glide: false });
      return;
    }
    const move = stepFromKey(event, dir);
    if (move === 0) return;
    event.preventDefault();
    step(move);
  }

  if (photo === undefined) return null;
  return (
    <Dialog.Root open={open} onOpenChange={onChange} actionsRef={actions}>
      <Dialog.Portal>
        <Dialog.Popup
          // DESIGN §8.1: the viewer is a modal dialog, which Base UI doesn't announce on its own
          aria-modal="true"
          initialFocus={heading}
          finalFocus={finalFocus}
          onKeyDown={onKeyDown}
          data-instant={instant || undefined}
          className="fixed inset-0 z-50 flex flex-col pb-[env(safe-area-inset-bottom)] text-ink transition-opacity duration-(--dur-modal) ease-out data-ending-style:opacity-0 data-ending-style:duration-(--dur-pop) data-starting-style:opacity-0 data-instant:transition-none motion-reduce:duration-(--dur-pop)"
        >
          {/* The viewer's black, apart from the photos, clears as a swipe down takes one away */}
          <div ref={backdrop} aria-hidden="true" className="absolute inset-0 bg-viewer" />
          <ViewerHeader
            index={index}
            total={photos.length}
            title={words.groups[photo.group]}
            heading={heading}
            scale={zoom.scale}
            onZoom={zoomBy}
            words={words}
          />
          <Dialog.Description className="sr-only">{words.title}</Dialog.Description>
          <div
            ref={measureStage}
            {...handlers}
            className={cn(
              "relative min-h-0 flex-1 touch-none overflow-hidden transition-[scale] duration-(--dur-modal) ease-out select-none in-data-instant:transition-none motion-safe:in-data-starting-style:scale-(--entry-scale) lg:mb-3",
              canZoomOut(zoom.scale) && "cursor-grab active:cursor-grabbing",
            )}
          >
            <div ref={track} className="absolute inset-0">
              {screen === null
                ? null
                : slotsAround(index, photos.length).map(({ index: place, offset }) => {
                    const slot = photos[place];
                    return slot === undefined ? null : (
                      <Slide
                        key={slot.id}
                        photo={slot}
                        offset={offset}
                        screen={screen}
                        zoomed={offset === 0 ? zoomed : FITTED}
                        dir={dir}
                        imperfection={words.imperfection}
                        broken={broken.has(slot.id)}
                        onBroken={() => onBroken(slot.id)}
                      />
                    );
                  })}
            </div>
            {photos.length > 1 ? (
              // At the first or last photo an arrow's disc stays solid over the photo, its caret faded
              <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-band">
                <Button
                  variant="quiet"
                  size="icon"
                  aria-label={words.previous}
                  disabled={!beside.previous}
                  onClick={() => step(-1)}
                  className="pointer-events-auto bg-surface-2 data-disabled:opacity-100 data-disabled:*:opacity-40"
                >
                  <CaretLeftIcon className="rtl:-scale-x-100" />
                </Button>
                <Button
                  variant="quiet"
                  size="icon"
                  aria-label={words.next}
                  disabled={!beside.next}
                  onClick={() => step(1)}
                  className="pointer-events-auto bg-surface-2 data-disabled:opacity-100 data-disabled:*:opacity-40"
                >
                  <CaretRightIcon className="rtl:-scale-x-100" />
                </Button>
              </div>
            ) : null}
          </div>
          {photos.length > 1 ? (
            <ViewerStrip
              ref={strip}
              photos={photos}
              current={photo}
              broken={broken}
              onBroken={onBroken}
              onChoose={choose}
            />
          ) : null}
          <div aria-live="polite" aria-atomic="true" className="sr-only">
            {announced === photo.id ? (
              <>
                <p>{words.positions[photos.length]?.[index]}</p>
                <p>{photo.alt}</p>
              </>
            ) : null}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type ViewerHeaderProps = {
  /** The place of the photo in view among the photos, from 0 */
  index: number;
  total: number;
  /** The name of the group of the photo in view, which titles the viewer */
  title: string;
  /** The title, which takes the focus as the viewer opens (DESIGN §8.4) */
  heading: RefObject<HTMLHeadingElement | null>;
  /** The scale of the photo in view, which sets the zoom buttons that work */
  scale: number;
  onZoom: (scaleFrom: (scale: number) => number, event: MouseEvent<HTMLButtonElement>) => void;
  words: Pick<ViewerWords, "zoomIn" | "zoomOut" | "close">;
};

/** The viewer's head: the count, the title, the zoom buttons and close */
function ViewerHeader({ index, total, title, heading, scale, onZoom, words }: ViewerHeaderProps) {
  return (
    <div className="relative flex shrink-0 items-center gap-2 px-band pt-[max(--spacing(2),env(safe-area-inset-top))] pb-2">
      <PhotoCount index={index} total={total} className="text-muted" />
      <Dialog.Title ref={heading} tabIndex={-1} className="ms-auto min-w-0 truncate type-body">
        {title}
      </Dialog.Title>
      <Button
        variant="quiet"
        size="icon"
        aria-label={words.zoomOut}
        disabled={!canZoomOut(scale)}
        onClick={(event) => onZoom(zoomOut, event)}
      >
        <MagnifyingGlassMinusIcon />
      </Button>
      <Button
        variant="quiet"
        size="icon"
        aria-label={words.zoomIn}
        disabled={!canZoomIn(scale)}
        onClick={(event) => onZoom(zoomIn, event)}
      >
        <MagnifyingGlassPlusIcon />
      </Button>
      <Dialog.Close
        render={
          <Button variant="quiet" size="icon" aria-label={words.close}>
            <XIcon />
          </Button>
        }
      />
    </div>
  );
}

type ViewerStripProps = {
  /** The strip, which the viewer's keys ask whether the focus is in */
  ref: RefObject<HTMLUListElement | null>;
  photos: readonly GalleryPhoto[];
  /** The photo in view, whose thumbnail is marked and is the strip's one tab stop */
  current: GalleryPhoto;
  broken: ReadonlySet<string>;
  onBroken: (id: string) => void;
  /** Called with the photo of the thumbnail pressed */
  onChoose: (photo: GalleryPhoto) => void;
};

/**
 * Desktop's thumbnail strip, one tab stop at the photo in view; its images load as it comes near
 * them, and never on a phone, which swipes instead (DESIGN §7.2.4). It keeps the thumbnail of the
 * photo in view in sight, from the viewer's open on, and the focus on it once the focus is in the
 * strip, as the arrow keys step through the photos.
 */
function ViewerStrip({ ref, photos, current, broken, onBroken, onChoose }: ViewerStripProps) {
  useEffect(() => {
    const thumbnail = ref.current?.querySelector<HTMLElement>("[aria-current]");
    thumbnail?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (ref.current?.contains(document.activeElement)) thumbnail?.focus();
  }, [ref, current.id]);
  return (
    <ul
      ref={ref}
      // Not a tab stop, as Firefox makes of a list that scrolls: the thumbnail of the photo in view
      // is the strip's one. The list clips what it scrolls, so it keeps the focus ring's 4 px above
      // its thumbnails, which the stage's 12 px make the 16 under the photo (DESIGN §7.2.4)
      tabIndex={-1}
      className="relative hidden shrink-0 justify-center-safe gap-2 overflow-x-auto px-band pt-1 pb-4 scrollbar-hidden lg:flex"
    >
      {photos.map((photo) => (
        <li key={photo.id} className={cn(STRIP_THUMBNAIL.width, "shrink-0")}>
          <PhotoThumbnail
            photo={photo}
            broken={broken.has(photo.id)}
            current={photo === current}
            tabIndex={photo === current ? undefined : -1}
            sizes={STRIP_THUMBNAIL.sizes}
            draggable={false}
            onBroken={() => onBroken(photo.id)}
            onClick={() => onChoose(photo)}
          />
        </li>
      ))}
    </ul>
  );
}

type SlideProps = {
  photo: GalleryPhoto;
  /** Where the photo is from the one in view: -1 before it, 1 after it */
  offset: Slot["offset"];
  screen: Size;
  zoomed: Zoomed;
  dir: "rtl" | "ltr";
  /** car.gallery.imperfection, the chip of an imperfection photo's caption */
  imperfection: string;
  /** Whether the photo's file didn't load, which shows it as a neutral tile */
  broken: boolean;
  onBroken: () => void;
};

/** One of the viewer's photos, fitted whole to the screen, or zoomed as the visitor zooms it */
function Slide({ photo, offset, screen, zoomed: { zoom, glide }, dir, imperfection, broken, onBroken }: SlideProps) {
  const fitted = fitRect(photo, screen);
  return (
    <div
      data-slide
      aria-hidden={offset === 0 ? undefined : true}
      className="absolute inset-0 flex items-center justify-center"
      // The next photo waits on the right in English and on the left in Arabic (nextSide)
      style={{ translate: `${offset * nextSide(dir) * 100}% 0` }}
    >
      <div
        // The zoom glides where the viewer says so, a zoom back to 1x too; a step, a close and a
        // new screen size show the photo fitted whole at once (FITTED)
        className={cn(
          "relative bg-surface-2",
          glide && "transition-transform duration-(--dur-pop) ease-out motion-reduce:transition-none",
        )}
        style={{
          width: fitted.width,
          height: fitted.height,
          ...frameColor(photo.color, broken),
          transform: isUnzoomed(zoom) ? undefined : `translate(${zoom.pan.x}px, ${zoom.pan.y}px) scale(${zoom.scale})`,
        }}
      >
        <CarPhoto
          photo={photo}
          broken={broken}
          sizes={`${Math.ceil(fitted.width)}px`}
          fetchPriority={offset === 0 ? "high" : "low"}
          draggable={false}
          onError={onBroken}
          className="size-full"
        />
        {!isUnzoomed(zoom) && !broken ? (
          // The largest file, over the one fitted to the screen, which shows until it comes in;
          // were it to fail, the one under it stays in view
          <Photo
            src={photo.largest}
            alt=""
            width={photo.width}
            height={photo.height}
            draggable={false}
            className="absolute inset-0 size-full"
          />
        ) : null}
      </div>
      {photo.group === "imperfection" ? (
        // Over the photo's foot, on the viewer's black, out of the zoom's reach: the filled chip,
        // as the price's badge is, and the note, which shows as written in the language the dealer
        // wrote it in when the page's has none (DESIGN §7.2.4)
        <div className="absolute inset-x-0 bottom-0 flex px-band pb-3">
          <p className="flex min-w-0 max-w-measure flex-wrap items-center gap-x-2 gap-y-1 bg-viewer p-2 type-small">
            <span className={cn(FILLED_CHIP, "text-warn")}>{imperfection}</span>{" "}
            {photo.note === null ? null : (
              <span lang={photo.note.lang} dir={directionOf(photo.note.lang)} className="px-1">
                {photo.note.text}
              </span>
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}
