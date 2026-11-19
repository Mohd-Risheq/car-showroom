import { CheckIcon, CornersOutIcon } from "@phosphor-icons/react/ssr";
import type { PublicCarDTO } from "@/lib/db/public-dto";
import { type AppLocale, directionOf } from "@/lib/i18n/locales";
import { largestVariant, smallestVariant, srcSetOf } from "@/lib/media/srcset";
import { photoGroupsOf, railOf } from "../domain/gallery";
import { closeupNotes, imperfectionNote, photoAlt } from "../domain/photo-alt";
import { carTitleIn } from "../domain/title";
import { type GalleryPhoto, type GalleryWords, PhotoGallery } from "./photo-gallery";
import type { Translate } from "./translate";

// FR-10's gallery, the stage's media (DESIGN §7.2.3). The server gives each photo its alt text
// (FR-10.6), an imperfection photo its note (DESIGN §7.2.4) and its files, and writes the words the
// gallery and its fullscreen viewer show, so their code in the browser carries no catalog (D-041);
// with JavaScript off, the cover still shows (DESIGN §10.3). A car without photos has a quiet frame
// in the stage's shape, out to the screen's edges below 1024 px as the stage is, with nothing to
// press, and so no viewer.

type CarGalleryProps = { car: PublicCarDTO; locale: AppLocale; t: Translate };

export function CarGallery({ car, locale, t }: CarGalleryProps) {
  if (car.photos.length === 0) {
    return (
      <div className="aspect-card bg-surface-2 surface-edge max-lg:bleed-band lg:aspect-auto lg:h-(--stage-height)" />
    );
  }
  const groups = photoGroupsOf(car.photos);
  const chips = groups.length > 1 ? groups.map(({ group }) => ({ group, name: t(`enum.photo_group.${group}`) })) : [];
  return (
    <PhotoGallery
      photos={galleryPhotos(car, locale, t)}
      chips={chips}
      tick={<CheckIcon aria-hidden="true" className="size-icon" />}
      fullscreen={<CornersOutIcon aria-hidden="true" className="size-icon" />}
      words={galleryWords(car, locale, t)}
      dir={directionOf(locale)}
    />
  );
}

/** The car's photos, in its order, each with its alt text, its files and an imperfection's note */
export function galleryPhotos(car: PublicCarDTO, locale: AppLocale, t: Translate): GalleryPhoto[] {
  const title = carTitleIn(car, locale);
  const notes = closeupNotes(car.inspection);
  return car.photos.map((photo): GalleryPhoto => {
    const note = notes.get(photo.id) ?? null;
    const alt = photoAlt(photo, { title, locale, note });
    return {
      id: photo.id,
      group: photo.group,
      alt: "text" in alt ? alt.text : t(alt.key, alt.values),
      note: imperfectionNote(photo.group, note, locale),
      src: smallestVariant(photo.variants),
      srcSet: srcSetOf(photo.variants),
      largest: largestVariant(photo.variants),
      width: photo.width,
      height: photo.height,
      color: photo.dominantColor,
    };
  });
}

/** The words the gallery and its viewer show, for each set of photos: every photo, or a group's */
export function galleryWords(car: PublicCarDTO, locale: AppLocale, t: Translate): GalleryWords {
  const totals = new Set([car.photos.length, ...photoGroupsOf(car.photos).map(({ count }) => count)]);
  const rest = new Set([...totals].map((total) => railOf(total).more).filter((count) => count > 0));
  return {
    fullscreen: t("car.gallery.fullscreen"),
    more: Object.fromEntries([...rest].map((count) => [count, t("car.gallery.more", { count })])),
    viewer: {
      title: carTitleIn(car, locale),
      groups: {
        exterior: t("enum.photo_group.exterior"),
        interior: t("enum.photo_group.interior"),
        engine: t("enum.photo_group.engine"),
        imperfection: t("enum.photo_group.imperfection"),
      },
      positions: Object.fromEntries(
        [...totals].map((total) => [
          total,
          Array.from({ length: total }, (_, place) => t("car.gallery.position", { n: place + 1, total })),
        ]),
      ),
      close: t("common.close"),
      previous: t("common.previous"),
      next: t("common.next"),
      zoomIn: t("car.gallery.zoomIn"),
      zoomOut: t("car.gallery.zoomOut"),
      imperfection: t("car.gallery.imperfection"),
    },
  };
}
