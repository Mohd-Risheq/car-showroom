import type { ComponentProps } from "react";
import { Photo } from "@/components/ui/photo";
import { cn } from "@/lib/class-names";
import type { GalleryPhoto } from "./photo-gallery";

// The parts the gallery and its fullscreen viewer share (FR-10): a car's photo, or its tile where
// its file didn't load, as the stage, the rail, the viewer's slides and its strip show it; the
// thumbnail the rail and the strip share; and the count of the photo in view. FR-10's error state:
// a photo whose file didn't load shows as a neutral tile with its alt text, on --surface-2 where
// its dominant colour stood in while it loaded. A thumbnail's tile is too small for the words,
// which only name it.

/** A photo whose file didn't load: a neutral tile with its alt text, hidden on a thumbnail's */
function BrokenPhoto({ alt, thumbnail }: { alt: string; thumbnail: boolean }) {
  return (
    <span className="grid size-full place-items-center bg-surface-2 p-4 text-center text-muted type-small surface-edge">
      {thumbnail ? <span className="sr-only">{alt}</span> : alt}
    </span>
  );
}

/** A photo's frame's colour while its file loads: its dominant colour, none once it failed */
export const frameColor = (color: string | null, broken: boolean) =>
  color === null || broken ? undefined : { backgroundColor: color };

type CarPhotoProps = Omit<ComponentProps<typeof Photo>, "src" | "srcSet" | "alt" | "width" | "height"> & {
  photo: GalleryPhoto;
  /** Whether its file didn't load, which shows it as a neutral tile */
  broken: boolean;
  thumbnail?: boolean;
};

/** A car's photo, at the widths the browser picks from, or its tile where its file didn't load */
export function CarPhoto({ photo, broken, thumbnail = false, ...props }: CarPhotoProps) {
  if (broken) return <BrokenPhoto alt={photo.alt} thumbnail={thumbnail} />;
  return (
    <Photo src={photo.src} srcSet={photo.srcSet} alt={photo.alt} width={photo.width} height={photo.height} {...props} />
  );
}

type PhotoThumbnailProps = Pick<ComponentProps<"button">, "tabIndex"> &
  Pick<CarPhotoProps, "photo" | "broken" | "sizes" | "draggable"> & {
    /** Whether its photo is the one in view, which marks it */
    current: boolean;
    onBroken: () => void;
    onClick: () => void;
  };

/** A photo's thumbnail, in the rail and the viewer's strip, which loads as it nears the screen */
export function PhotoThumbnail({ photo, broken, current, onBroken, onClick, tabIndex, ...image }: PhotoThumbnailProps) {
  return (
    <button
      type="button"
      aria-current={current || undefined}
      tabIndex={tabIndex}
      onClick={onClick}
      className={cn(
        // Each photo at its full exposure, as it is evidence. The one in view is marked by a bar in
        // --scan under its thumbnail, off the photo, which the pointer previews in --line (DESIGN
        // §7.2.3).
        "pressable relative block aspect-card w-full bg-surface-2",
        "after:absolute after:inset-x-0 after:-bottom-2 after:h-0.5 hover:not-aria-current:after:bg-line aria-current:after:bg-scan",
        // Forced colours drop the bar's colour, so there the thumbnail in view gains a frame inside
        // it, unless keyboard focus's ring marks it (DESIGN §4.5)
        "forced-colors:aria-current:not-focus-visible:outline-2 forced-colors:aria-current:not-focus-visible:-outline-offset-4",
      )}
      style={frameColor(photo.color, broken)}
    >
      <CarPhoto
        photo={photo}
        broken={broken}
        thumbnail
        loading="lazy"
        onError={onBroken}
        className="size-full object-cover"
        {...image}
      />
    </button>
  );
}

/**
 * The place of the photo in view among the photos, as 3 / 18, where there is more than one, its
 * place in --scan, the mark of the item in view (DESIGN §3.1): figures as Figures sets them
 */
export function PhotoCount({ index, total, className }: { index: number; total: number; className?: string }) {
  if (total < 2) return null;
  return (
    <p className={cn("type-small", className)}>
      <bdi dir="ltr" className="figures">
        <span className="text-scan">{index + 1}</span>
        {` / ${total}`}
      </bdi>
    </p>
  );
}
