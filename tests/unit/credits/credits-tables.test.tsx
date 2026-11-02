import { readFileSync } from "node:fs";
import { createTranslator } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type CreditsData, creditsTables, readCredits } from "@/features/credits/domain/credits";
import { CreditsTables } from "@/features/credits/ui/credits-tables";
import { isolate } from "@/lib/i18n/bidi";
import { INTL_LOCALE } from "@/lib/i18n/intl-locale";
import type { AppLocale } from "@/lib/i18n/locales";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";

// SCR-14's Credits page's tables (DESIGN §7.2.9) as the page renders them in each language, from the
// synthetic manifest of the seed checks' fixture: the tables in order, each named and headed, a row's
// cells under the right columns, links where a source gives an address, and no table without rows.

const FIXTURES = "tests/fixtures/checks/seed";
const json = (file: string): unknown => JSON.parse(readFileSync(`${FIXTURES}/${file}`, "utf8"));

const read = readCredits({
  credits: json("public/seed/credits.json"),
  cars: json("seed/cars.json"),
  reference: json("seed/reference.json"),
  software: {
    $comment: "Written by pnpm credits:software",
    rows: [
      { name: "clsx", licence: "mit", source: "https://github.com/lukeed/clsx", licenceFile: "license" },
      { name: "radix-ui", licence: "mit", source: "https://github.com/radix-ui/primitives", licenceFile: "LICENSE" },
      {
        name: "@radix-ui/*",
        within: "radix-ui",
        licence: "mit",
        source: "https://github.com/radix-ui/primitives",
        licenceUrl: "https://cdn.jsdelivr.net/npm/radix-ui@1.4.3/LICENSE",
      },
      {
        name: "aria-hidden",
        version: "1.2.6",
        within: "radix-ui",
        licence: "mit",
        source: "https://github.com/theKashey/aria-hidden",
        licenceFile: "LICENSE",
      },
    ],
  },
  dependencies: { clsx: "2.1.1", "radix-ui": "1.4.3" },
});
if (!read.ok) throw new Error(read.problems.join("\n"));
const CREDITS = read.credits;

const MESSAGES = { ar, en } as const;

function markupOf(locale: AppLocale, tables: CreditsData = creditsTables(CREDITS, locale)): string {
  const t = createTranslator({ locale: INTL_LOCALE[locale], messages: MESSAGES[locale] });
  return renderToStaticMarkup(<CreditsTables tables={tables} t={t} />);
}

/** A fragment's text, as a reader gets it */
const textOf = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, "")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");

type Section = { title: string; label: string; head: string[]; rows: string[][] };

/** Each table under its heading: its frame's name, its columns' headings, and each row's cells as markup */
function sectionsOf(markup: string): Section[] {
  const SECTION = /<h2[^>]*>(.*?)<\/h2><div [^>]*aria-label="([^"]*)"[^>]*><table[^>]*>([\s\S]*?)<\/table><\/div>/g;
  return [...markup.matchAll(SECTION)].map(([, title = "", label = "", table = ""]) => {
    const [head = "", body = ""] = table.split("</thead>");
    return {
      title: textOf(title),
      label: textOf(label),
      head: [...head.matchAll(/<th scope="col"[^>]*>(.*?)<\/th>/g)].map(([, cell = ""]) => textOf(cell)),
      rows: body
        .split("<tr>")
        .slice(1)
        .map((row) => [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(([, cell = ""]) => cell)),
    };
  });
}

const EN = sectionsOf(markupOf("en"));
const section = (sections: Section[], title: string) => {
  const found = sections.find((candidate) => candidate.title === title);
  if (found === undefined) throw new Error(`No table titled ${title}`);
  return found;
};

describe("the Credits page's tables", () => {
  it("come in the page's order, each named for screen readers by its heading", () => {
    expect(EN.map(({ title, label }) => [title, label])).toStrictEqual([
      ["Car photos", "Car photos"],
      ["Engine sounds", "Engine sounds"],
      ["Data", "Data"],
      ["Fonts", "Fonts"],
      ["Software", "Software"],
    ]);
  });

  it("head the photos by their car, the sounds with their recording next, and the software without an author", () => {
    expect(section(EN, "Car photos").head).toStrictEqual(["Car", "Source", "Author", "Licence", "Link", "Changes"]);
    expect(section(EN, "Engine sounds").head).toStrictEqual([
      "Car",
      "Recording",
      "Source",
      "Author",
      "Licence",
      "Link",
      "Changes",
    ]);
    expect(section(EN, "Data").head).toStrictEqual(["Source", "Author", "Licence", "Link"]);
    expect(section(EN, "Fonts").head).toStrictEqual(["Source", "Author", "Licence", "Link"]);
    expect(section(EN, "Software").head).toStrictEqual(["Source", "Licence", "Link"]);
  });

  it("credit a photo's author, licence and original, each linked, and list its changes one to a line", () => {
    const [car, site, author, licence, original, changes] = section(EN, "Car photos").rows[0] ?? [];
    expect(car).toBe(`2019 Toyota Land Cruiser ${isolate("GXR")}`);
    expect(site).toBe("Wikimedia Commons");
    expect(author).toMatch(
      /^<a href="https:\/\/commons\.wikimedia\.org\/wiki\/User:Example_Photographer" class="[^"]*underline[^"]*"><bdi>Example Photographer<\/bdi><\/a>$/,
    );
    expect(licence).toMatch(
      /^<a href="https:\/\/creativecommons\.org\/licenses\/by-sa\/4\.0\/" class="[^"]*whitespace-nowrap[^"]*">CC BY-SA 4\.0<\/a>$/,
    );
    expect(original).toMatch(
      /^<a href="https:\/\/commons\.wikimedia\.org\/wiki\/File:Example_Land_Cruiser_01\.jpg" [^>]*><bdi>Example Land Cruiser 01<\/bdi><\/a>$/,
    );
    expect(changes).toBe(
      '<ul><li class="whitespace-nowrap">Resized</li><li class="whitespace-nowrap">Plates pixelated</li></ul>',
    );
    expect(section(EN, "Car photos").rows).toHaveLength(28);
  });

  it("say a library clip is another car's of the same engine, and give a clip of the car its date", () => {
    const [car, recording, site] = section(EN, "Engine sounds").rows[0] ?? [];
    expect([car, textOf(recording ?? ""), site]).toStrictEqual([
      `2019 Toyota Land Cruiser ${isolate("GXR")}`,
      "Recording of the same engine type, not this car",
      "Freesound",
    ]);
    const tables = creditsTables(CREDITS, "en");
    const dated = { ...tables, sounds: tables.sounds.map((row) => ({ ...row, recording: { text: "12 Oct 2026" } })) };
    expect(section(sectionsOf(markupOf("en", dated)), "Engine sounds").rows[0]?.[1]).toBe("12 Oct 2026");
  });

  it("credit a clip's author, licence and original, each linked, and list its changes one to a line", () => {
    const [, , , author, licence, original, changes] = section(EN, "Engine sounds").rows[0] ?? [];
    expect(author).toMatch(
      /^<a href="https:\/\/freesound\.org\/people\/ExampleRecordist\/" class="[^"]*underline[^"]*"><bdi>Example Recordist<\/bdi><\/a>$/,
    );
    expect(licence).toMatch(
      /^<a href="https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/" class="[^"]*whitespace-nowrap[^"]*">CC BY 4\.0<\/a>$/,
    );
    expect(original).toMatch(
      /^<a href="https:\/\/freesound\.org\/people\/ExampleRecordist\/sounds\/100001\/" [^>]*><bdi>V8 cold start, idle<\/bdi><\/a>$/,
    );
    const items = ["Trimmed", "Mixed to mono", "Resampled", "Volume normalized"].map(
      (change) => `<li class="whitespace-nowrap">${change}</li>`,
    );
    expect(changes).toBe(`<ul>${items.join("")}</ul>`);
  });

  it("show a licence without a page, and an author without one, as plain text, a licence on one line", () => {
    const tables = creditsTables(CREDITS, "en");
    const [first] = tables.photos;
    if (first === undefined) throw new Error("No photo in the fixture");
    const own = {
      ...first,
      site: "credits.site.owner",
      author: { text: "The owner", href: null },
      licence: { key: "credits.licence.owner", href: null },
      original: null,
    } as const;
    const [row] = section(sectionsOf(markupOf("en", { ...tables, photos: [own] })), "Car photos").rows;
    expect(row?.slice(1, 5)).toStrictEqual([
      "Made for this site",
      "<bdi>The owner</bdi>",
      `<span class="whitespace-nowrap">All rights reserved</span>`,
      "",
    ]);
  });

  it("credit each data source and font by its name, author, licence and link", () => {
    const [name, author, licence, link] = section(EN, "Data").rows[0] ?? [];
    expect([name, author]).toStrictEqual([
      "<bdi>NHTSA vPIC</bdi>",
      "<bdi>National Highway Traffic Safety Administration</bdi>",
    ]);
    expect(licence).toMatch(
      /^<a href="https:\/\/www\.usa\.gov\/government-copyright" class="[^"]*whitespace-nowrap[^"]*">Public domain<\/a>$/,
    );
    expect(link).toMatch(
      /^<a href="https:\/\/vpic\.nhtsa\.dot\.gov\/api\/" [^>]*><bdi>vpic\.nhtsa\.dot\.gov\/<wbr\/>api<\/bdi><\/a>$/,
    );
    expect(section(EN, "Fonts").rows.map((row) => row.map(textOf))).toStrictEqual([
      [
        "Readex Pro",
        "Thomas Jockin, Nadine Chahine, Bonnie Shaver-Troup, Santiago Orozco, Héctor Gómez",
        "SIL OFL 1.1",
        "github.com/ThomasJockin/readexpro",
      ],
      ["Martian Mono", "Roman Shamin, Evil Martians", "SIL OFL 1.1", "github.com/evilmartians/mono"],
    ]);
  });

  it("name each package with its version and what bundles a work, and let an address break after a slash", () => {
    const rows = section(EN, "Software").rows.map((row) => row.map(textOf));
    expect(rows).toStrictEqual([
      ["clsx 2.1.1", "MIT", "github.com/lukeed/clsx"],
      ["radix-ui 1.4.3", "MIT", "github.com/radix-ui/primitives"],
      [`@radix-ui/* Part of ${isolate("radix-ui")}`, "MIT", "github.com/radix-ui/primitives"],
      [`aria-hidden 1.2.6 Part of ${isolate("radix-ui")}`, "MIT", "github.com/theKashey/aria-hidden"],
    ]);
    expect(section(EN, "Software").rows[0]?.[2]).toMatch(
      /^<a href="https:\/\/github\.com\/lukeed\/clsx" [^>]*><bdi>github\.com\/<wbr\/>lukeed\/<wbr\/>clsx<\/bdi><\/a>$/,
    );
    expect(section(EN, "Software").rows[0]?.[1]).toMatch(
      /^<a href="https:\/\/cdn\.jsdelivr\.net\/npm\/clsx@2\.1\.1\/license" [^>]*>MIT<\/a>$/,
    );
  });

  it("leave out a table with no rows, heading and all", () => {
    const tables = creditsTables(CREDITS, "en");
    const markup = markupOf("en", { ...tables, photos: [], sounds: [] });
    expect(sectionsOf(markup).map(({ title }) => title)).toStrictEqual(["Data", "Fonts", "Software"]);
    expect(markup.match(/<h2/g)).toHaveLength(3);
  });

  it("render the same tables in Arabic, in its words", () => {
    const AR = sectionsOf(markupOf("ar"));
    expect(AR.map(({ title }) => title)).toStrictEqual([
      "صور السيارات",
      "أصوات المحركات",
      "البيانات",
      "الخطوط",
      "البرمجيات",
    ]);
    expect(section(AR, "صور السيارات").head).toStrictEqual([
      "السيارة",
      "المصدر",
      "المؤلف",
      "الرخصة",
      "الرابط",
      "التعديلات",
    ]);
    expect(section(AR, "صور السيارات").rows[0]?.[0]).toBe(`2019 تويوتا لاند كروزر ${isolate("GXR")}`);
    expect(textOf(section(AR, "البرمجيات").rows[3]?.[0] ?? "")).toBe(`aria-hidden 1.2.6 جزء من ${isolate("radix-ui")}`);
    // A name that starts with a neutral sign keeps it at its start inside Arabic text (FR-01.8)
    expect(section(AR, "البرمجيات").rows[2]?.[0]).toMatch(/^<bdi>@radix-ui\/\*<\/bdi> /);
    expect(AR.map(({ rows }) => rows.length)).toStrictEqual(EN.map(({ rows }) => rows.length));
  });
});
