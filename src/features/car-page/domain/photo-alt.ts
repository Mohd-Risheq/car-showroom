import type { PhotoGroup } from "@/lib/db/enums";
import type { Bilingual, PublicInspection, PublicPhoto } from "@/lib/db/public-dto";
import { isWritten, type LocalizedText, textIn } from "@/lib/i18n/bilingual";
import type { AppLocale } from "@/lib/i18n/locales";

// FR-10.6 and DESIGN §8.6: a photo's alt text in the page's language. The dealer's own where they
// wrote it in that language; else car.gallery.alt, "{title}, {group}", as a photo records its group
// and not its angle; or for an imperfection photo, car.gallery.altImperfection with the note of the
// panel it is the close-up of, where the note is in the page's language. The other language's alt
// text never stands in for the page's (public-dto.ts's PublicPhoto). The fullscreen viewer's caption
// shows an imperfection photo's note in either language (DESIGN §7.2.4).

/** A photo's alt text: the dealer's own words, or the catalog's message that composes them */
export type PhotoAlt =
  | { readonly text: string }
  | { readonly key: "car.gallery.alt"; readonly values: { readonly title: string; readonly group: PhotoGroup } }
  | {
      readonly key: "car.gallery.altImperfection";
      readonly values: { readonly title: string; readonly note: string };
    };

type AltContext = {
  /** The car's title in the page's language (carTitleIn) */
  readonly title: string;
  readonly locale: AppLocale;
  /** The note of the panel the photo is the close-up of, or null when it is none's */
  readonly note: Bilingual | null;
};

export function photoAlt(photo: Pick<PublicPhoto, "alt" | "group">, { title, locale, note }: AltContext): PhotoAlt {
  const own = photo.alt[locale];
  if (isWritten(own)) return { text: own };
  const noted = note?.[locale];
  if (photo.group === "imperfection" && isWritten(noted)) {
    return { key: "car.gallery.altImperfection", values: { title, note: noted } };
  }
  return { key: "car.gallery.alt", values: { title, group: photo.group } };
}

/**
 * An imperfection photo's note, which the viewer's caption shows (DESIGN §7.2.4): in the page's
 * language, else as the dealer wrote it in the other one, marked with that language. A photo of
 * another group has none, as has a close-up whose panel has no note.
 */
export function imperfectionNote(group: PhotoGroup, note: Bilingual | null, locale: AppLocale): LocalizedText | null {
  if (group !== "imperfection" || note === null) return null;
  return textIn(note, locale);
}

/** The notes of the panels whose close-up the gallery shows, by the photo's id (FR-13) */
export function closeupNotes(inspection: Pick<PublicInspection, "panels"> | null): ReadonlyMap<string, Bilingual> {
  const notes = new Map<string, Bilingual>();
  for (const { closeupPhotoId, note } of inspection?.panels ?? []) {
    if (closeupPhotoId !== null) notes.set(closeupPhotoId, note);
  }
  return notes;
}
