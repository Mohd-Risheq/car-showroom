import { describe, expect, it } from "vitest";
import { closeupNotes, imperfectionNote, type PhotoAlt, photoAlt } from "@/features/car-page/domain/photo-alt";
import type { Bilingual } from "@/lib/db/public-dto";
import type { AppLocale } from "@/lib/i18n/locales";
import { translator } from "../../support/page-copy";
import { publicPanel } from "../../support/public-car";

// FR-10.6, DESIGN §8.6 and TC-10-4: every photo's alt text, in the page's language. The dealer's
// own where they wrote one in it, else "{title}, {group}" composed from the car and the photo's
// group, or for an imperfection photo the note of the panel it shows, where the note is in the
// page's language. The other language's alt text never stands in, as a photo's is no fallback.

const TITLE = { ar: "2019 تويوتا كامري هايبرد LE", en: "2019 Toyota Camry Hybrid LE" };
const NONE: Bilingual = { ar: null, en: null };

/** The alt text as the page writes it */
function written(alt: PhotoAlt, locale: AppLocale): string {
  if ("text" in alt) return alt.text;
  return translator(locale)(alt.key, alt.values);
}

const altOf = (photo: Parameters<typeof photoAlt>[0], locale: AppLocale, note: Bilingual | null = null) =>
  written(photoAlt(photo, { title: TITLE[locale], locale, note }), locale);

describe("photoAlt", () => {
  it("takes the dealer's alt text in the page's language", () => {
    const photo = { group: "exterior", alt: { ar: "الواجهة الأمامية", en: "The front" } } as const;
    expect(altOf(photo, "en")).toBe("The front");
    expect(altOf(photo, "ar")).toBe("الواجهة الأمامية");
  });

  it("composes one from the car's title and the photo's group in either language (TC-10-4)", () => {
    expect(altOf({ group: "interior", alt: NONE }, "en")).toBe("2019 Toyota Camry Hybrid LE, interior");
    expect(altOf({ group: "engine", alt: NONE }, "en")).toBe("2019 Toyota Camry Hybrid LE, engine bay");
    expect(altOf({ group: "exterior", alt: NONE }, "ar")).toBe("2019 تويوتا كامري هايبرد LE، من الخارج");
    expect(altOf({ group: "engine", alt: NONE }, "ar")).toBe("2019 تويوتا كامري هايبرد LE، حجرة المحرك");
    expect(altOf({ group: "imperfection", alt: NONE }, "ar")).toBe("2019 تويوتا كامري هايبرد LE، عيب ظاهر");
  });

  it("composes one where the dealer wrote it only in the other language, or left it blank", () => {
    expect(altOf({ group: "interior", alt: { ar: "المقاعد الأمامية", en: null } }, "en")).toBe(
      "2019 Toyota Camry Hybrid LE, interior",
    );
    expect(altOf({ group: "interior", alt: { ar: " ", en: "Front seats" } }, "ar")).toBe(
      "2019 تويوتا كامري هايبرد LE، من الداخل",
    );
  });

  it("adds an imperfection's note in the page's language", () => {
    const note = { ar: "خدش صغير على الباب", en: "A small scratch on the door" };
    expect(altOf({ group: "imperfection", alt: NONE }, "en", note)).toBe(
      "2019 Toyota Camry Hybrid LE, imperfection: A small scratch on the door",
    );
    expect(altOf({ group: "imperfection", alt: NONE }, "ar", note)).toBe(
      "2019 تويوتا كامري هايبرد LE، عيب ظاهر: خدش صغير على الباب",
    );
  });

  it("leaves out a note only in the other language, and a note on another group's photo", () => {
    expect(altOf({ group: "imperfection", alt: NONE }, "en", { ar: "خدش صغير", en: null })).toBe(
      "2019 Toyota Camry Hybrid LE, imperfection",
    );
    expect(altOf({ group: "exterior", alt: NONE }, "en", { ar: null, en: "A small scratch" })).toBe(
      "2019 Toyota Camry Hybrid LE, exterior",
    );
  });

  it("keeps the dealer's own alt text over the note", () => {
    expect(altOf({ group: "imperfection", alt: { ar: null, en: "The scratch" } }, "en", NONE)).toBe("The scratch");
  });
});

describe("closeupNotes", () => {
  it("gives each close-up photo its panel's note", () => {
    const note = { ar: null, en: "A chip on the edge" };
    const notes = closeupNotes({
      panels: [publicPanel({ closeupPhotoId: "p7", note }), publicPanel({ panelId: "roof", closeupPhotoId: null })],
    });
    expect([...notes]).toStrictEqual([["p7", note]]);
  });

  it("gives none for a car without an inspection", () => {
    expect(closeupNotes(null).size).toBe(0);
  });
});

describe("imperfectionNote", () => {
  const BOTH: Bilingual = { ar: "خدش على حافة الغطاء", en: "A chip on the hood's edge" };

  it("gives an imperfection photo its panel's note in the page's language", () => {
    expect(imperfectionNote("imperfection", BOTH, "en")).toStrictEqual({ text: BOTH.en, lang: "en" });
    expect(imperfectionNote("imperfection", BOTH, "ar")).toStrictEqual({ text: BOTH.ar, lang: "ar" });
  });

  it("gives the note the dealer wrote only in the other language, marked with it (DESIGN §7.2.4)", () => {
    expect(imperfectionNote("imperfection", { ar: null, en: BOTH.en }, "ar")).toStrictEqual({
      text: BOTH.en,
      lang: "en",
    });
    expect(imperfectionNote("imperfection", { ar: BOTH.ar, en: " " }, "en")).toStrictEqual({
      text: BOTH.ar,
      lang: "ar",
    });
  });

  it("gives none to an imperfection photo without a written note, nor to any other photo's note", () => {
    expect(imperfectionNote("imperfection", null, "en")).toBeNull();
    expect(imperfectionNote("imperfection", NONE, "ar")).toBeNull();
    expect(imperfectionNote("imperfection", { ar: " ", en: "" }, "en")).toBeNull();
    expect(imperfectionNote("exterior", BOTH, "en")).toBeNull();
  });
});
