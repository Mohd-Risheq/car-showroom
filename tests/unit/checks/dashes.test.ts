import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { dashesIn, dashesInJson, dashesInMdx, dashSources } from "../../../scripts/checks/dashes.ts";

// C-07's dash check (TC-NFR-15): the finders, then pnpm check:dashes on the planted and clean
// fixtures in tests/fixtures/checks/dashes

describe("dashesIn", () => {
  it.each([
    ["\u2012", "a figure dash (U+2012)"],
    ["\u2013", "an en dash (U+2013)"],
    ["\u2014", "an em dash (U+2014)"],
    ["\u2015", "a horizontal bar (U+2015)"],
    ["\u2e3a", "a two-em dash (U+2E3A)"],
    ["\u2e3b", "a three-em dash (U+2E3B)"],
    ["\ufe31", "a vertical em dash (U+FE31)"],
    ["\ufe32", "a vertical en dash (U+FE32)"],
    ["\ufe58", "a small em dash (U+FE58)"],
  ])("finds %s as %s", (written, dash) => {
    expect(dashesIn(`2 ${written} 3 days`)).toStrictEqual([{ written, dash }]);
  });

  it("leaves hyphens and the minus sign alone", () => {
    expect(dashesIn("road-legal, a non\u2011breaking hyphen, a \u2010 hyphen and \u221210 \u00b0C")).toStrictEqual([]);
  });

  it("finds every dash in Arabic text", () => {
    expect(dashesIn("\u0645\u0627\u0644\u0643\u0627\u0646 \u2014 \u0633\u062c\u0644 \u2013")).toHaveLength(2);
  });
});

describe("dashesInJson", () => {
  it("names each dash by its key path, through objects and arrays, in string values only", () => {
    const catalog = {
      cost: { charging: { home: "Home \u2014 overnight", "key\u2014name": "fine" } },
      cars: [{ notes: ["clean", "two \u2013 owners"] }],
      count: 3,
      flag: null,
    };
    expect(dashesInJson(catalog)).toStrictEqual([
      {
        written: "\u2014",
        dash: "an em dash (U+2014)",
        path: "cost.charging.home",
        excerpt: "Home \u2014 overnight",
      },
      { written: "\u2013", dash: "an en dash (U+2013)", path: "cars[0].notes[1]", excerpt: "two \u2013 owners" },
    ]);
  });

  it("names a string at the top as the empty path", () => {
    expect(dashesInJson("a \u2014 b")[0]?.path).toBe("");
  });

  it("quotes a long text around its dash, wherever the dash falls", () => {
    const words = (count: number) => "word ".repeat(count);
    const excerpt = (text: string) => dashesInJson(text)[0]?.excerpt ?? "";
    const early = excerpt(`${words(1)}\u2014 ${words(60)}`);
    const middle = excerpt(`${words(40)}\u2014 ${words(40)}`);
    const late = excerpt(`${words(60)}\u2014 ${words(1)}`);
    for (const quoted of [early, middle, late]) {
      expect(quoted).toContain("\u2014");
      expect(quoted.replaceAll("...", "").length).toBe(100);
    }
    expect(early).toMatch(/^word \u2014 .*\.\.\.$/);
    expect(middle).toMatch(/^\.\.\..*\u2014.*\.\.\.$/);
    expect(late).toMatch(/^\.\.\..* \u2014 word $/);
  });
});

describe("dashesInMdx", () => {
  it("finds dashes written as characters, HTML entities and escapes, by line and column", () => {
    const source = [
      "# Title",
      "Then &mdash; this, &ndash; that, &horbar; and &MDASH;",
      "&#8212; &#8211; &#x2014; &#X2013; &#8210;",
      '{"\\u2014"} {"\\u{2013}"} and a plain \u2014',
    ].join("\n");
    expect(
      dashesInMdx(source).map(({ line, column, written, dash }) => `${line}:${column} ${written} ${dash}`),
    ).toStrictEqual([
      "2:6 &mdash; an em dash (U+2014)",
      "2:20 &ndash; an en dash (U+2013)",
      "2:34 &horbar; a horizontal bar (U+2015)",
      "2:47 &MDASH; an em dash (U+2014)",
      "3:1 &#8212; an em dash (U+2014)",
      "3:9 &#8211; an en dash (U+2013)",
      "3:17 &#x2014; an em dash (U+2014)",
      "3:26 &#X2013; an en dash (U+2013)",
      "3:35 &#8210; a figure dash (U+2012)",
      "4:3 \\u2014 an em dash (U+2014)",
      "4:14 \\u{2013} an en dash (U+2013)",
      "4:37 \u2014 an em dash (U+2014)",
    ]);
  });

  it("finds every long dash in each written form, leading zeros and all", () => {
    const source = "&#x2E3A; &#65112; \\ufe58 \\u{2e3b} &#08212; &#x02014; \\u{002013}";
    expect(dashesInMdx(source).map(({ written, dash }) => `${written} ${dash}`)).toStrictEqual([
      "&#x2E3A; a two-em dash (U+2E3A)",
      "&#65112; a small em dash (U+FE58)",
      "\\ufe58 a small em dash (U+FE58)",
      "\\u{2e3b} a three-em dash (U+2E3B)",
      "&#08212; an em dash (U+2014)",
      "&#x02014; an em dash (U+2014)",
      "\\u{002013} an en dash (U+2013)",
    ]);
  });

  it("leaves other entities and escapes alone", () => {
    expect(dashesInMdx("&amp; &nbsp; &#8209; &#82120; &#x20140; \\u2011 \\u2212 \\u02014 &minus;")).toStrictEqual([]);
  });
});

describe("dashSources", () => {
  const root = mkdtempSync(path.join(tmpdir(), "muftah-dash-sources-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  for (const file of [
    "messages/en.json",
    "messages/ar.json",
    "messages/drafts/en.json",
    "seed/cars.json",
    "seed/notes.txt",
    "public/seed/credits.json",
    "public/seed/other.json",
    "content/how-its-built.mdx",
    "src/app/page.mdx",
    "node_modules/pkg/readme.mdx",
    "coverage/report.mdx",
    "docs/spec.mdx",
    "tests/fixtures/checks/dashes/planted/content/how-its-built.mdx",
    ".next/server/page.mdx",
  ]) {
    mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
    writeFileSync(path.join(root, file), "{}");
  }
  const relative = (files: string[]) => files.map((file) => path.relative(root, file)).sort();

  it("reads the catalogs, the seed data, the seed credits and MDX anywhere but the folders without user-facing text", () => {
    expect(relative(dashSources(root))).toStrictEqual([
      "content/how-its-built.mdx",
      "messages/ar.json",
      "messages/en.json",
      "public/seed/credits.json",
      "seed/cars.json",
      "src/app/page.mdx",
    ]);
  });

  it("reads the given files, and the JSON and MDX in the given folders", () => {
    const given = [path.join(root, "seed/notes.txt"), path.join(root, "tests/fixtures")];
    expect(relative(dashSources(root, given))).toStrictEqual([
      "seed/notes.txt",
      "tests/fixtures/checks/dashes/planted/content/how-its-built.mdx",
    ]);
  });
});

describe("pnpm check:dashes", () => {
  const run = (folder: string) =>
    spawnSync(process.execPath, ["scripts/check-dashes.ts", `tests/fixtures/checks/dashes/${folder}`], {
      encoding: "utf8",
    });

  it("fails on the planted dashes, naming each file, key or line, and dash", () => {
    const result = run("planted");
    expect(result.status).toBe(1);
    expect(result.stderr.trim().split("\n")).toStrictEqual([
      "tests/fixtures/checks/dashes/planted/content/how-its-built.mdx:3:19: &mdash;, an em dash (U+2014)",
      "tests/fixtures/checks/dashes/planted/content/how-its-built.mdx:5:21: &#x2013;, an en dash (U+2013)",
      "tests/fixtures/checks/dashes/planted/content/how-its-built.mdx:5:47: \\u2014, an em dash (U+2014)",
      "tests/fixtures/checks/dashes/planted/content/how-its-built.mdx:7:13: an em dash (U+2014)",
      'tests/fixtures/checks/dashes/planted/messages/en.json: cost.charging.home: an em dash (U+2014) in "Home charging \u2014 overnight"',
      'tests/fixtures/checks/dashes/planted/messages/en.json: inventory.count: an en dash (U+2013) in "{count, plural, one {# car} other {# cars}} \u2013 updated today"',
      'tests/fixtures/checks/dashes/planted/seed/cars.json: [0].description.ar: a figure dash (U+2012) in "\u0645\u0627\u0644\u0643\u0627\u0646 \u2012 \u0633\u062c\u0644 \u0635\u064a\u0627\u0646\u0629 \u0643\u0627\u0645\u0644"',
    ]);
  });

  it("passes the clean fixture", () => {
    const result = run("clean");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("check:dashes: no dashes in 2 files (C-07)\n");
  });
});
