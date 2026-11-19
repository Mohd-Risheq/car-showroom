import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { carTitleIn } from "@/features/car-page/domain/title";
import { CarGallery, galleryPhotos, galleryWords } from "@/features/car-page/ui/car-gallery";
import type { PhotoGroup } from "@/lib/db/enums";
import type { PublicCarDTO, PublicPhoto } from "@/lib/db/public-dto";
import type { AppLocale } from "@/lib/i18n/locales";
import ar from "../../../messages/ar.json";
import { translator } from "../../support/page-copy";
import { publicCar, publicInspection, publicPanel } from "../../support/public-car";

// FR-10's gallery as the server writes it (DESIGN §7.2.3), which is all a browser without
// JavaScript gets: every photo in the car's order, the cover first (FR-10.1), each named by its alt
// text (FR-10.6) and on its dominant colour, the cover's file alone asked for until the visitor
// turns to the photos (NFR-PERF-06); the count below 1024 px, the desktop rail, and a chip for each
// group when two or more have photos. A car without photos has a quiet frame in the stage's place,
// with nothing to press. The server writes the words the gallery and its fullscreen viewer show.

function render(car: PublicCarDTO, locale: AppLocale = "en") {
  return renderToStaticMarkup(<CarGallery car={car} locale={locale} t={translator(locale)} />);
}

/** A stored photo, at the seed's widths */
function photo(place: number, group: PhotoGroup, changes: Partial<PublicPhoto> = {}): PublicPhoto {
  return {
    id: `p${place}`,
    group,
    alt: { ar: null, en: null },
    width: 1200,
    height: 900,
    placeholder: null,
    dominantColor: "#2f4858",
    variants: {
      "480": `/seed/s01/${place}-480.webp`,
      "960": `/seed/s01/${place}-960.webp`,
      "1200": `/seed/s01/${place}-1200.webp`,
    },
    ...changes,
  };
}

/** TC-10-1's car: 18 photos, 3 of them imperfections, in the dealer's order */
const GROUPS: PhotoGroup[] = [
  ...Array<PhotoGroup>(8).fill("exterior"),
  "imperfection",
  ...Array<PhotoGroup>(4).fill("interior"),
  ...Array<PhotoGroup>(2).fill("engine"),
  ...Array<PhotoGroup>(2).fill("imperfection"),
  "exterior",
];
const EIGHTEEN = GROUPS.map((group, index) => photo(index + 1, group));

/** The stage's slides, in their order */
const slidesOf = (html: string) => [...html.matchAll(/<li data-photo="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)];

/**
 * A slide's name: its photo's alt text, or before the visitor turns to the photos, the hidden text
 * that stands in for a photo whose file waits
 */
const nameOf = (slide = "") =>
  (/ alt="([^"]*)"/.exec(slide) ?? /<span class="sr-only">([^<]*)<\/span>/.exec(slide))?.[1];

/** A slide's image */
const imgOf = (slide = "") => /<img [^>]*\/>/.exec(slide)?.[0];

/** The rail's thumbnails */
const thumbnailsOf = (html: string) => [...html.matchAll(/<li data-thumbnail="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)];

/** The chips: each one's name and whether it is pressed */
const chipsOf = (html: string) =>
  [...html.matchAll(/<button type="button" aria-pressed="(true|false)"[^>]*>([\s\S]*?)<\/button>/g)].map(
    ([, pressed, name]) => ({ pressed, name }),
  );

describe("the car page's gallery", () => {
  it("shows every photo in the car's order, the cover first, each named by its alt text (FR-10.1, FR-10.6)", () => {
    const car = publicCar({ photos: EIGHTEEN });
    const html = render(car);
    const slides = slidesOf(html);
    expect(slides.map(([, id]) => id)).toStrictEqual(EIGHTEEN.map(({ id }) => id));
    const title = carTitleIn(car, "en");
    expect(nameOf(slides[0]?.[2])).toBe(`${title}, exterior`);
    expect(nameOf(slides[8]?.[2])).toBe(`${title}, imperfection`);
    expect(nameOf(slides[9]?.[2])).toBe(`${title}, interior`);
    expect(nameOf(slides[13]?.[2])).toBe(`${title}, engine bay`);
    const arabic = slidesOf(render(car, "ar"));
    expect(nameOf(arabic[0]?.[2])).toBe(`${carTitleIn(car, "ar")}، من الخارج`);
  });

  it("takes the dealer's alt text, and a close-up's note in the page's language (FR-10.6)", () => {
    const closeup = photo(2, "imperfection");
    const car = publicCar({
      photos: [photo(1, "exterior", { alt: { ar: null, en: "The front three-quarters" } }), closeup],
      inspection: publicInspection({
        panels: [publicPanel({ note: { ar: null, en: "A chip on the edge" }, closeupPhotoId: closeup.id })],
      }),
    });
    const slides = slidesOf(render(car));
    expect(nameOf(slides[0]?.[2])).toBe("The front three-quarters");
    expect(nameOf(slides[1]?.[2])).toBe(`${carTitleIn(car, "en")}, imperfection: A chip on the edge`);
  });

  it("asks for the cover's file at once, in the width the browser picks, and no other photo's (NFR-PERF-06)", () => {
    const slides = slidesOf(render(publicCar({ photos: EIGHTEEN })));
    expect(imgOf(slides[0]?.[2])).toMatch(
      /^<img decoding="async" src="\/seed\/s01\/1-480\.webp" srcSet="\/seed\/s01\/1-480\.webp 480w, \/seed\/s01\/1-960\.webp 960w, \/seed\/s01\/1-1200\.webp 1200w" sizes="\(min-width: 110rem\) 61rem, \(min-width: 64rem\) 58vw, 100vw" alt="[^"]+" width="1200" height="900" loading="eager" fetchPriority="high" class="[^"]*"\/>$/,
    );
    for (const [, , slide] of slides.slice(1)) expect(imgOf(slide)).toBeUndefined();
  });

  it("writes no preload of the cover, whose width a phone picked apart from the img's", () => {
    expect(render(publicCar({ photos: EIGHTEEN }))).not.toContain('rel="preload"');
  });

  it("shows each photo's dominant colour while it loads, or the stage's own without one (FR-10)", () => {
    const [coloured] = slidesOf(render(publicCar({ photos: [photo(1, "exterior")] })));
    expect(coloured?.[2]).toMatch(/^<button [^>]*style="background-color:#2f4858"/);
    const [plain] = slidesOf(render(publicCar({ photos: [photo(1, "exterior", { dominantColor: null })] })));
    expect(plain?.[2]).toMatch(/^<button [^>]*class="[^"]*\bbg-surface-2\b[^"]*"[^>]*>/);
    expect(plain?.[2]).not.toContain("style=");
  });

  it("counts the photos below 1024 px, the first in view, its place marked in --scan (DESIGN §3.1)", () => {
    expect(render(publicCar({ photos: EIGHTEEN }))).toMatch(
      /<p class="[^"]*\blg:hidden\b[^"]*"><bdi dir="ltr" class="figures"><span class="text-scan">1<\/span> \/ 18<\/bdi><\/p>/,
    );
  });

  it("gives the desktop rail the first six thumbnails, lazily (DESIGN §7.2.3)", () => {
    const thumbnails = thumbnailsOf(render(publicCar({ photos: EIGHTEEN })));
    expect(thumbnails.map(([, id]) => id)).toStrictEqual(["p1", "p2", "p3", "p4", "p5", "p6"]);
    for (const [, , thumbnail] of thumbnails) {
      expect(thumbnail).toContain('loading="lazy"');
      expect(thumbnail).toContain('sizes="(min-width: 110rem) 7.75rem, 8vw"');
    }
    expect(thumbnails[0]?.[2]).toMatch(/^<button type="button" aria-current="true" /);
    expect(thumbnails[1]?.[2]).toMatch(/^<button type="button" class="/);
  });

  it("marks the photo in view on the rail with a --scan bar under its thumbnail (DESIGN §3.1)", () => {
    const thumbnails = thumbnailsOf(render(publicCar({ photos: EIGHTEEN })));
    expect(thumbnails).toHaveLength(6);
    for (const [, , thumbnail] of thumbnails) {
      const classes = /^<button [^>]*class="([^"]*)"/.exec(thumbnail ?? "")?.[1]?.split(" ");
      expect(classes).toContain("aria-current:after:bg-scan");
      expect(classes).toContain("after:-bottom-2");
    }
  });

  it("sets the stage out to a phone's edges, with its focus ring inside it, and in the column from 1024 px", () => {
    const stage = /<div class="([^"]*\bfocus-frame\b[^"]*)"/.exec(render(publicCar({ photos: EIGHTEEN })))?.[1];
    expect(stage?.split(" ")).toStrictEqual(expect.arrayContaining(["max-lg:bleed-band", "max-lg:focus-frame-inside"]));
    expect(stage?.split(" ")).not.toContain("bleed-band");
  });

  it("shows each photo at 4:3 on a phone and from 1024 px as tall as --stage-height lets it (D-049)", () => {
    for (const [, , slide] of slidesOf(render(publicCar({ photos: EIGHTEEN })))) {
      const classes = /<button [^>]*class="([^"]*)"/.exec(slide ?? "")?.[1]?.split(" ");
      expect(classes).toStrictEqual(expect.arrayContaining(["aspect-card", "lg:aspect-auto", "lg:h-(--stage-height)"]));
      expect(classes).not.toContain("lg:aspect-hero");
    }
  });

  it("shows the seventh photo whole in the rail's tile, with how many more in an edged --bg capsule at its end", () => {
    const html = render(publicCar({ photos: EIGHTEEN }));
    const tile = /<button type="button" aria-label="Show 12 more photos"[^>]*>([\s\S]*?)<\/button>/.exec(html)?.[1];
    expect(imgOf(tile)).toContain('src="/seed/s01/7-480.webp"');
    expect(imgOf(tile)).toContain('loading="lazy"');
    expect(tile).toContain(
      '<span class="absolute end-1 bottom-1 rounded-full bg-bg px-2 type-small surface-edge"><bdi dir="ltr" class="figures">+12</bdi></span>',
    );
  });

  it("gives the rail every photo up to seven", () => {
    const seven = EIGHTEEN.slice(0, 7);
    expect(thumbnailsOf(render(publicCar({ photos: seven }))).map(([, id]) => id)).toStrictEqual(
      seven.map(({ id }) => id),
    );
  });

  it("gives each group with photos a chip, in FR-10's order, none pressed", () => {
    expect(chipsOf(render(publicCar({ photos: EIGHTEEN })))).toStrictEqual([
      { pressed: "false", name: "Exterior" },
      { pressed: "false", name: "Interior" },
      { pressed: "false", name: "Engine bay" },
      { pressed: "false", name: "Imperfections" },
    ]);
    expect(chipsOf(render(publicCar({ photos: EIGHTEEN }), "ar")).map(({ name }) => name)).toStrictEqual([
      ar.enum.photo_group.exterior,
      ar.enum.photo_group.interior,
      ar.enum.photo_group.engine,
      ar.enum.photo_group.imperfection,
    ]);
  });

  it("makes each chip an outline chip that fills with --ink once pressed (DESIGN §6.4)", () => {
    const chips = [
      ...render(publicCar({ photos: EIGHTEEN })).matchAll(
        /<button type="button" aria-pressed="[^"]*" class="([^"]*)"/g,
      ),
    ];
    expect(chips).toHaveLength(4);
    for (const [, classes] of chips) {
      expect(classes?.split(" ")).toStrictEqual(
        expect.arrayContaining([
          "border",
          "border-line",
          "aria-pressed:border-ink",
          "aria-pressed:bg-ink",
          "aria-pressed:text-bg",
        ]),
      );
    }
  });

  it("gives no chips to photos all in one group", () => {
    expect(chipsOf(render(publicCar({ photos: EIGHTEEN.filter(({ group }) => group === "exterior") })))).toStrictEqual(
      [],
    );
  });

  it("is the anchor of the imperfection group, where the car has photos in it (FR-09.13a)", () => {
    expect(render(publicCar({ photos: EIGHTEEN }))).toMatch(/^<div id="photos-imperfection" /);
    expect(render(publicCar({ photos: EIGHTEEN.filter(({ group }) => group !== "imperfection") }))).not.toContain(
      'id="photos-imperfection"',
    );
  });

  it("shows one photo alone: no count, no rail and no chips (DESIGN §10.3)", () => {
    const html = render(publicCar({ photos: [photo(1, "exterior")] }));
    expect(slidesOf(html)).toHaveLength(1);
    expect(html).not.toContain("1 / 1");
    expect(thumbnailsOf(html)).toStrictEqual([]);
    expect(chipsOf(html)).toStrictEqual([]);
  });

  it("holds the stage's place with a quiet frame for a car without photos, out to a phone's edges as the stage", () => {
    expect(render(publicCar({ photos: [] }))).toBe(
      '<div class="aspect-card bg-surface-2 surface-edge max-lg:bleed-band lg:aspect-auto lg:h-(--stage-height)"></div>',
    );
  });
});

describe("the gallery's photos", () => {
  it("give each imperfection photo its panel's note for the viewer's caption, in either language (DESIGN §7.2.4)", () => {
    const [closeup, other, plain] = [photo(1, "imperfection"), photo(2, "exterior"), photo(3, "imperfection")];
    const car = publicCar({
      photos: [closeup, other, plain],
      inspection: publicInspection({
        panels: [
          publicPanel({ note: { ar: null, en: "A chip on the edge" }, closeupPhotoId: closeup.id }),
          // A close-up outside the imperfection group is no imperfection photo
          publicPanel({ panelId: "roof", note: { ar: null, en: "A dent" }, closeupPhotoId: other.id }),
        ],
      }),
    });
    const notes = (locale: AppLocale) => galleryPhotos(car, locale, translator(locale)).map(({ note }) => note);
    expect(notes("en")).toStrictEqual([{ text: "A chip on the edge", lang: "en" }, null, null]);
    expect(notes("ar")).toStrictEqual([{ text: "A chip on the edge", lang: "en" }, null, null]);
  });
});

describe("the gallery's words", () => {
  it("count each photo's place in each set the gallery shows: every photo, or a group's (DESIGN §8.3)", () => {
    const { viewer } = galleryWords(publicCar({ photos: EIGHTEEN }), "en", translator("en"));
    // 18 photos: 9 of the exterior, 4 of the interior, 2 of the engine bay and 3 imperfections
    expect(Object.keys(viewer.positions).map(Number)).toStrictEqual([2, 3, 4, 9, 18]);
    expect(viewer.positions[18]).toHaveLength(18);
    expect(viewer.positions[18]?.[0]).toBe("Photo 1 of 18");
    expect(viewer.positions[18]?.[17]).toBe("Photo 18 of 18");
    expect(viewer.positions[3]).toStrictEqual(["Photo 1 of 3", "Photo 2 of 3", "Photo 3 of 3"]);
    const arabic = galleryWords(publicCar({ photos: EIGHTEEN }), "ar", translator("ar"));
    expect(arabic.viewer.positions[18]?.[1]).toBe("الصورة 2 من 18");
  });

  it("name the rail's tile for each set past seven photos (DESIGN §7.2.3)", () => {
    expect(galleryWords(publicCar({ photos: EIGHTEEN }), "en", translator("en")).more).toStrictEqual({
      3: "Show 3 more photos",
      12: "Show 12 more photos",
    });
    expect(galleryWords(publicCar({ photos: EIGHTEEN.slice(0, 7) }), "en", translator("en")).more).toStrictEqual({});
  });

  it("name the viewer's controls, the groups that title it and the car it shows (DESIGN §7.2.4)", () => {
    const car = publicCar({ photos: EIGHTEEN });
    expect(galleryWords(car, "en", translator("en"))).toMatchObject({
      fullscreen: "Full screen",
      viewer: {
        title: carTitleIn(car, "en"),
        groups: { exterior: "Exterior", interior: "Interior", engine: "Engine bay", imperfection: "Imperfections" },
        close: "Close",
        previous: "Previous",
        next: "Next",
        zoomIn: "Zoom in",
        zoomOut: "Zoom out",
        imperfection: "Imperfection",
      },
    });
    expect(galleryWords(car, "ar", translator("ar")).viewer).toMatchObject({
      title: carTitleIn(car, "ar"),
      groups: ar.enum.photo_group,
      close: ar.common.close,
      previous: ar.common.previous,
      next: ar.common.next,
      zoomIn: ar.car.gallery.zoomIn,
      zoomOut: ar.car.gallery.zoomOut,
      imperfection: ar.car.gallery.imperfection,
    });
  });
});
