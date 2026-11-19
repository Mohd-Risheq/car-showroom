import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CloseupSource } from "@/features/car-page/domain/evidence";
import { EvidenceStrip } from "@/features/car-page/ui/evidence-strip";
import type { AppLocale } from "@/lib/i18n/locales";
import { translator } from "../../support/page-copy";

// FR-09.13's evidence strip under the facts (DESIGN §7.2.3): a list labelled evidence.title of
// outline chips, each an icon and the evidence the car has, linking to where it shows. The
// close-ups' chip counts the photos of the panels that aren't original and opens the gallery's
// imperfection group (FR-09.13a). A car with none has no strip (FR-09.13c, D-046).

function render(car: CloseupSource, locale: AppLocale = "en") {
  return renderToStaticMarkup(<EvidenceStrip car={car} t={translator(locale)} />);
}

/** A car with as many close-ups of touched-up panels, each in its imperfection group */
function withCloseups(count: number): CloseupSource {
  const photos = Array.from({ length: count }, (_, place) => ({ id: `p${place}`, group: "imperfection" as const }));
  return { photos, inspection: { panels: photos.map(({ id }) => ({ state: "touch_up", closeupPhotoId: id })) } };
}

/** Markup's text as the page shows it, where React writes an apostrophe as its reference */
const textOf = (markup = "") => markup.replaceAll("&#x27;", "'");

/** The strip's list: its label, and each chip's link and words */
function stripOf(html: string) {
  const list = /^<ul aria-label="([^"]*)"[^>]*>([\s\S]*)<\/ul>$/.exec(html);
  if (list === null) throw new Error(`No strip in ${html}`);
  const chips = [
    ...(list[2] ?? "").matchAll(/<li><a href="([^"]*)"[^>]*>(<svg [^>]*>[\s\S]*?<\/svg>)([^<]*)<\/a><\/li>/g),
  ];
  return {
    label: textOf(list[1]),
    chips: chips.map(([, href, icon = "", words]) => ({
      href,
      words: textOf(words),
      iconHidden: icon.includes('aria-hidden="true"'),
    })),
  };
}

describe("the evidence strip", () => {
  it("lists the close-ups' chip, which opens the gallery's imperfection group (FR-09.13a)", () => {
    expect(stripOf(render(withCloseups(1)))).toStrictEqual({
      label: "What's documented",
      chips: [{ href: "#photos-imperfection", words: "1 close-up of a flaw", iconHidden: true }],
    });
    expect(stripOf(render(withCloseups(2))).chips[0]?.words).toBe("2 close-ups of flaws");
  });

  it("counts the close-ups in Arabic, in each of its plural forms", () => {
    const words = (count: number) => stripOf(render(withCloseups(count), "ar")).chips[0]?.words;
    expect(stripOf(render(withCloseups(1), "ar")).label).toBe("ما تم توثيقه");
    expect(words(1)).toBe("صورة مقرّبة لعيب ظاهر");
    expect(words(2)).toBe("صورتان مقرّبتان لعيوب ظاهرة");
    expect(words(3)).toBe("3 صور مقرّبة لعيوب ظاهرة");
    expect(words(11)).toBe("11 صورة مقرّبة لعيوب ظاهرة");
  });

  it("is left out, with no list, for a car without a close-up (FR-09.13c)", () => {
    expect(render(withCloseups(0))).toBe("");
    expect(render({ photos: [{ id: "p1", group: "imperfection" }], inspection: null })).toBe("");
  });
});
