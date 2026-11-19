"use client";

import {
  type ComponentType,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { buttonClasses } from "@/components/ui/button-classes";
import { TOGGLE_CHIP } from "@/components/ui/chip-classes";
import { type Input, inputOfClick } from "@/components/ui/dialog-input";
import { Figures } from "@/components/ui/figures";
import { reportClientError } from "@/lib/analytics/track";
import { cn } from "@/lib/class-names";
import type { PhotoGroup } from "@/lib/db/enums";
import type { LocalizedText } from "@/lib/i18n/bilingual";
import { onDemand } from "@/lib/on-demand";
import { followsOnPage, IMPERFECTIONS_ID, inGroup, railOf, stepFromKey, stepTo } from "../domain/gallery";
import { CarPhoto, frameColor, PhotoCount, PhotoThumbnail } from "./photo-parts";
import type { PhotoViewerProps } from "./photo-viewer";

// FR-10's gallery on the page, in the browser (DESIGN §7.2.3). One track holds every photo: a phone
// swipes through it natively, and a desktop shows a photo at a time from the rail under it. The
// photo in view is the one most of whose slide shows, however it got there, and below 1024 px the
// count says which it is. From the photos' one tab stop the arrow keys step through them in the
// reading direction (FR-10.3), at once, as nothing the keyboard moves glides (DESIGN §4.2). Below
// 1024 px the stage runs out to the screen's edges, with the count and full screen in a capsule at
// its bottom end and its focus ring drawn inside it; from 1024 px the stage is 4:3 where the screen
// holds it with the rail under it, 3:2 at the least (--stage-height), and full screen closes the
// rail's row (DESIGN §7.2.3). A group's chip filters the photos, showing its first, and pressed
// again shows them all, the photo in view staying (TC-10-1). The imperfection group's link
// (FR-09.13a) is the fragment of the page's address, which shows the group's first photo each time
// it is followed, also where the address already ends at it. Until the visitor turns to the photos,
// by a press, the focus or a wheel on the gallery, or that link, the stage asks for the cover's
// file alone (NFR-PERF-06): on a phone, which hides the rail, that is the gallery's only file, and
// from 1024 px the rail's thumbnails and its tile's photo load with the page (D-049). A photo, the
// rail's tile and full screen open the fullscreen viewer (photo-viewer.tsx), whose code loads when
// a finger or the focus lands on one of them. A photo whose file didn't load shows as a neutral
// tile with its alt text, there and in the viewer, and is reported, which the beacon sends once a
// page (FR-10). The server writes every word the gallery and its viewer show (car-gallery.tsx).

export type GalleryPhoto = {
  readonly id: string;
  readonly group: PhotoGroup;
  /** The alt text, in the page's language (photo-alt.ts) */
  readonly alt: string;
  /** An imperfection photo's note, which the viewer's caption shows (photo-alt.ts), else null */
  readonly note: LocalizedText | null;
  /** The narrowest file, and every width (srcset.ts) */
  readonly src: string;
  readonly srcSet: string;
  /** The widest file, which the viewer shows once the photo is zoomed (FR-10.4) */
  readonly largest: string;
  readonly width: number;
  readonly height: number;
  /** The stored dominant colour, which the photo's frame shows while it loads (FR-10) */
  readonly color: string | null;
};

/** The words the fullscreen viewer shows, written on the server (car-gallery.tsx) */
export type ViewerWords = {
  /** The car's title, which describes the viewer */
  readonly title: string;
  /** Each group's name, which titles the viewer while it shows one of the group's photos */
  readonly groups: Readonly<Record<PhotoGroup, string>>;
  /** car.gallery.position for each place in a set of photos, by the number in the set */
  readonly positions: Readonly<Record<number, readonly string[]>>;
  readonly close: string;
  readonly previous: string;
  readonly next: string;
  readonly zoomIn: string;
  readonly zoomOut: string;
  /** car.gallery.imperfection, the chip of an imperfection photo's caption */
  readonly imperfection: string;
};

/** The words the gallery shows, written on the server (car-gallery.tsx) */
export type GalleryWords = {
  /** car.gallery.fullscreen, the name of the button that opens the viewer at the photo in view */
  readonly fullscreen: string;
  /** car.gallery.more, the name of the rail's tile, by the number of photos past its thumbnails */
  readonly more: Readonly<Record<number, string>>;
  readonly viewer: ViewerWords;
};

/** A group's chip: the group, and its name */
type GalleryChip = { readonly group: PhotoGroup; readonly name: string };

type PhotoGalleryProps = {
  photos: readonly GalleryPhoto[];
  /** A chip for each group with photos, or none when every photo is in one */
  chips: readonly GalleryChip[];
  /** The tick a pressed chip shows, drawn on the server */
  tick: ReactNode;
  /** The full screen button's icon, drawn on the server */
  fullscreen: ReactNode;
  words: GalleryWords;
  dir: "rtl" | "ltr";
};

/** How much of a slide shows when it is the one in view */
const IN_VIEW = 0.6;

/** What on the gallery shows the visitor turning to the photos: a press, the focus or a wheel */
const INTENT = ["pointerdown", "focusin", "wheel"] as const;

/**
 * The width a photo takes, for the browser's pick of a file: the screen's, then from 1024 px
 * (--breakpoint-lg) 7 of the 12 columns, about 58vw, and from 1760 px, where the content stops
 * (--container-content), the column's 976 px, with the page's margin and the gutters at their
 * widest (--spacing-page, --spacing-gutter). A rail's thumbnail takes a seventh of the column beside
 * full screen, 124 px at most.
 */
const STAGE_SIZES = "(min-width: 110rem) 61rem, (min-width: 64rem) 58vw, 100vw";
const THUMBNAIL_SIZES = "(min-width: 110rem) 7.75rem, 8vw";

/**
 * The fullscreen viewer, which loads when a finger or the focus lands on what opens it. Offline it
 * stays closed, and the next press loads it again (D-047).
 */
const loadViewer = onDemand(() => import("./photo-viewer").then(({ PhotoViewer }) => PhotoViewer), "CHUNK_VIEWER");

export function PhotoGallery({ photos, chips, tick, fullscreen, words, dir }: PhotoGalleryProps) {
  const [group, setGroup] = useState<PhotoGroup | null>(null);
  const [current, setCurrent] = useState(photos[0]?.id);
  const [intent, setIntent] = useState(false);
  const [Viewer, setViewer] = useState<ComponentType<PhotoViewerProps> | null>(null);
  const [open, setOpen] = useState(false);
  /** The photo the viewer shows, from its first open */
  const [viewed, setViewed] = useState<string>();
  /** How the visitor opened the viewer: from the keyboard it shows at once (DESIGN §4.2) */
  const [openedBy, setOpenedBy] = useState<Input>("pointer");
  const gallery = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLUListElement>(null);
  /** What opened the viewer, which the focus goes back to when it closes (FR-10.7) */
  const opener = useRef<HTMLElement | null>(null);
  /**
   * Whether the page is on the screen, so a viewer whose code arrives after a navigation away opens
   * nothing
   */
  const onScreen = useRef(false);
  /** The photos whose files didn't load, which show as neutral tiles (FR-10) */
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());
  const shown = inGroup(photos, group);
  const index = Math.max(
    shown.findIndex(({ id }) => id === current),
    0,
  );
  const { thumbnails, more } = railOf(shown.length);
  // The photo the rail's tile shows and opens, past the thumbnails
  const seventh = shown[thumbnails];

  /** Shows a photo whose file didn't load as a neutral tile, and reports it (NFR-OBS-02) */
  const breaks = useCallback((id: string) => {
    setBroken((known) => (known.has(id) ? known : new Set(known).add(id)));
    reportClientError("PHOTO");
  }, []);

  useEffect(() => {
    const list = track.current;
    if (list === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const { isIntersecting, target } of entries) {
          if (isIntersecting && target instanceof HTMLElement) setCurrent(target.dataset.photo);
        }
      },
      { root: list, threshold: IN_VIEW },
    );
    for (const slide of list.children) observer.observe(slide);
    return () => observer.disconnect();
  }, []);

  // A file that failed as the page loaded, before this code ran, fired its error to no listener
  useEffect(() => {
    for (const image of gallery.current?.querySelectorAll("img") ?? []) {
      const frame = image.closest<HTMLElement>("[data-photo], [data-thumbnail], [data-more]");
      const id = frame?.dataset.photo ?? frame?.dataset.thumbnail ?? frame?.dataset.more;
      if (id !== undefined && image.complete && image.naturalWidth === 0) breaks(id);
    }
  }, [breaks]);

  useEffect(() => {
    const root = gallery.current;
    if (root === null || intent) return;
    const show = () => setIntent(true);
    for (const type of INTENT) root.addEventListener(type, show, { passive: true });
    return () => {
      for (const type of INTENT) root.removeEventListener(type, show);
    };
  }, [intent]);

  // The imperfections' link, when the page opens at it and when it is followed on the page: by the
  // fragment it gives the address, or by a press of the link where the address already ends at it,
  // which changes no fragment. Followed, it shows the group's first photo, wherever the photos were.
  useEffect(() => {
    const first = photos.find((photo) => photo.group === "imperfection");
    if (first === undefined) return;
    const fragment = `#${IMPERFECTIONS_ID}`;
    const showImperfections = () => {
      setIntent(true);
      setGroup("imperfection");
      setCurrent(first.id);
    };
    const follow = () => {
      flushSync(showImperfections);
      if (track.current !== null) scrollToSlide(track.current, first.id, true);
    };
    const followFragment = () => {
      if (location.hash === fragment) follow();
    };
    const followPress = (event: globalThis.MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest(`a[href="${fragment}"]`) : null;
      if (link !== null && followsOnPage(event)) follow();
    };
    if (location.hash === fragment) showImperfections();
    addEventListener("hashchange", followFragment);
    addEventListener("click", followPress);
    return () => {
      removeEventListener("hashchange", followFragment);
      removeEventListener("click", followPress);
    };
  }, [photos]);

  // A page Next.js keeps, hidden, after a navigation away closes its viewer, which would otherwise
  // hold the focus and the page's scroll from the page that follows (Activity)
  useEffect(() => {
    onScreen.current = true;
    return () => {
      onScreen.current = false;
      setOpen(false);
    };
  }, []);

  // A filter, once it shows, brings in the photo it chose
  const filtered = useRef(group);
  useLayoutEffect(() => {
    if (filtered.current === group || track.current === null) return;
    filtered.current = group;
    scrollToSlide(track.current, current, true);
  }, [group, current]);

  function onSlideKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const move = stepFromKey(event, dir);
    if (move === 0 || track.current === null) return;
    event.preventDefault();
    const next = shown[stepTo(index, move, shown.length)];
    if (next === undefined) return;
    setCurrent(next.id);
    const slide = scrollToSlide(track.current, next.id, true);
    slide?.querySelector("button")?.focus({ preventScroll: true });
  }

  function prepare() {
    loadViewer((component) => setViewer(() => component));
  }

  function view(at: string | undefined, event: MouseEvent<HTMLButtonElement>) {
    if (at === undefined) return;
    opener.current = event.currentTarget;
    setViewed(at);
    setOpenedBy(inputOfClick(event));
    if (Viewer !== null) {
      setOpen(true);
      return;
    }
    loadViewer((component) => {
      if (!onScreen.current) return;
      // It mounts closed, then opens: a dialog that mounts open skips its entrance
      flushSync(() => setViewer(() => component));
      setOpen(true);
    });
  }

  function toggleGroup(chip: PhotoGroup) {
    const chosen = group === chip ? null : chip;
    setGroup(chosen);
    if (chosen !== null) setCurrent(inGroup(photos, chosen)[0]?.id);
  }

  return (
    <div
      ref={gallery}
      id={photos.some((photo) => photo.group === "imperfection") ? IMPERFECTIONS_ID : undefined}
      className="grid gap-3 lg:grid-cols-[1fr_auto] lg:gap-x-4 lg:gap-y-2"
    >
      <div className="relative col-start-1 row-start-1 min-w-0 focus-frame max-lg:bleed-band max-lg:focus-frame-inside lg:col-span-2">
        <ul
          ref={track}
          // Not a tab stop, as Firefox makes of a list that scrolls: the photo in view is the
          // stage's one
          tabIndex={-1}
          className="flex snap-x snap-mandatory scrollbar-hidden overflow-x-auto overscroll-x-contain motion-safe:scroll-smooth"
        >
          {photos.map((photo, place) => (
            <li
              key={photo.id}
              data-photo={photo.id}
              hidden={!shown.includes(photo)}
              className="w-full shrink-0 snap-center snap-always"
            >
              <button
                type="button"
                tabIndex={photo === shown[index] ? 0 : -1}
                aria-haspopup="dialog"
                onKeyDown={onSlideKeyDown}
                onPointerDown={prepare}
                onFocus={prepare}
                onClick={(event) => view(photo.id, event)}
                // The frame holds the hidden name that stands in for its photo, so the track clips it.
                // A tap neither waits for a double tap nor flashes the system's highlight, and the
                // photo doesn't shrink under the finger, as the track swipes.
                className="relative block aspect-card w-full cursor-zoom-in touch-manipulation bg-surface-2 [-webkit-tap-highlight-color:transparent] lg:aspect-auto lg:h-(--stage-height)"
                style={frameColor(photo.color, broken.has(photo.id))}
              >
                {place === 0 || intent ? (
                  <CarPhoto
                    photo={photo}
                    broken={broken.has(photo.id)}
                    sizes={STAGE_SIZES}
                    loading={place === 0 ? "eager" : "lazy"}
                    fetchPriority={place === 0 ? "high" : undefined}
                    onError={() => breaks(photo.id)}
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="sr-only">{photo.alt}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="relative col-start-1 row-start-1 flex items-center self-end justify-self-end rounded-full bg-bg max-lg:mb-4 max-lg:surface-edge lg:col-start-2 lg:row-start-2 lg:self-center lg:bg-transparent">
        <PhotoCount index={index} total={shown.length} className="ps-4 lg:hidden" />
        <button
          type="button"
          aria-label={words.fullscreen}
          aria-haspopup="dialog"
          onPointerDown={prepare}
          onFocus={prepare}
          onClick={(event) => view(shown[index]?.id, event)}
          className={cn(buttonClasses({ variant: "quiet", size: "icon" }), "lg:border lg:border-line")}
        >
          {fullscreen}
        </button>
      </div>
      {thumbnails > 0 ? (
        <ul className="hidden grid-cols-7 gap-2 lg:col-start-1 lg:row-start-2 lg:grid">
          {shown.slice(0, thumbnails).map((photo) => (
            <li key={photo.id} data-thumbnail={photo.id}>
              <PhotoThumbnail
                photo={photo}
                broken={broken.has(photo.id)}
                current={photo === shown[index]}
                sizes={THUMBNAIL_SIZES}
                onBroken={() => breaks(photo.id)}
                onClick={() => {
                  setCurrent(photo.id);
                  if (track.current !== null) scrollToSlide(track.current, photo.id, false);
                }}
              />
            </li>
          ))}
          {more > 0 && seventh !== undefined ? (
            <li data-more={seventh.id}>
              <button
                type="button"
                aria-label={words.more[more]}
                aria-haspopup="dialog"
                onPointerDown={prepare}
                onFocus={prepare}
                onClick={(event) => view(seventh.id, event)}
                // The seventh photo, whole as a thumbnail's, with the count of the rest in a capsule at
                // its end, as a phone's stage holds its count; the pointer marks it as a thumbnail
                className="pressable relative block aspect-card w-full bg-surface-2 after:absolute after:inset-x-0 after:-bottom-2 after:h-0.5 hover:after:bg-line"
                style={frameColor(seventh.color, broken.has(seventh.id))}
              >
                <CarPhoto
                  photo={seventh}
                  broken={broken.has(seventh.id)}
                  thumbnail
                  sizes={THUMBNAIL_SIZES}
                  loading="lazy"
                  onError={() => breaks(seventh.id)}
                  className="size-full object-cover"
                />
                <span className="absolute end-1 bottom-1 rounded-full bg-bg px-2 type-small surface-edge">
                  <Figures>{`+${more}`}</Figures>
                </span>
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-2 lg:col-span-2 lg:mt-2">
          {chips.map(({ group: chip, name }) => (
            <button
              key={chip}
              type="button"
              aria-pressed={group === chip}
              onClick={() => toggleGroup(chip)}
              className={TOGGLE_CHIP}
            >
              {group === chip ? tick : null}
              {name}
            </button>
          ))}
        </div>
      ) : null}
      {Viewer ? (
        <Viewer
          photos={shown}
          at={viewed}
          onAtChange={setViewed}
          input={openedBy}
          open={open}
          onOpenChange={setOpen}
          finalFocus={opener}
          words={words.viewer}
          dir={dir}
          broken={broken}
          onBroken={breaks}
        />
      ) : null}
    </div>
  );
}

/**
 * Scrolls the track to the photo's slide, at once or as the track scrolls, and returns the slide.
 * The slide's offset from the track's edge holds in either reading direction. It scrolls to a
 * place, not by a distance, which Chromium would end at the next slide, as each slide stops a
 * scroll.
 */
function scrollToSlide(list: HTMLElement, id: string | undefined, instant: boolean): Element | undefined {
  const slide = [...list.children].find((child) => child instanceof HTMLElement && child.dataset.photo === id);
  if (slide === undefined) return undefined;
  const left = list.scrollLeft + slide.getBoundingClientRect().left - list.getBoundingClientRect().left;
  list.scrollTo({ left, behavior: instant ? "instant" : "auto" });
  return slide;
}
