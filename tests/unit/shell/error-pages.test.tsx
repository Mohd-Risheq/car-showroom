import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import SegmentError from "@/app/[locale]/(public)/(site)/error";
import GlobalError from "@/app/global-error";
import { ShellStringsProvider } from "@/features/shell/ui/shell-strings";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";

// SCR-11's error pages (DESIGN §7.2.11, §8.1): the segment error, in a failed page's place inside the
// shell, its line heading the page, with Try again; and the global error page, a minimal page in
// both languages, the default language's line heading it and the other's its twin, each with a
// reload button. A heading per page, so a navigation's focus lands on it (FR-02.4).

vi.mock("@/styles/fonts", () => ({ fontVariables: "fonts" }));

const CATALOGS = { ar, en };

/** Each element of a name in the markup: its attributes as written, and what it holds */
function elements(markup: string, name: string): { attributes: string; inner: string }[] {
  return Array.from(markup.matchAll(new RegExp(`<${name}((?: [^>]*)?)>(.*?)</${name}>`, "gs")), (match) => ({
    attributes: match[1] ?? "",
    inner: match[2] ?? "",
  }));
}

describe("the segment error", () => {
  for (const locale of ["ar", "en"] as const) {
    const t = CATALOGS[locale];
    const markup = renderToStaticMarkup(
      <ShellStringsProvider value={{ segmentError: t.errors.segment, retry: t.common.retry }}>
        <SegmentError error={new Error("failed")} retry={() => undefined} />
      </ShellStringsProvider>,
    );

    it(`is an alert headed by its line, with Try again, in ${locale}`, () => {
      expect(markup).toMatch(/^<div role="alert"[ >]/);
      expect(elements(markup, "h1").map(({ inner }) => inner)).toStrictEqual([t.errors.segment]);
      const buttons = elements(markup, "button");
      expect(buttons).toHaveLength(1);
      expect(buttons[0]?.inner).toContain(t.common.retry);
    });
  }
});

describe("the global error page", () => {
  const markup = renderToStaticMarkup(<GlobalError />);

  it("is an Arabic page, as the site's default, titled with its Arabic line", () => {
    expect(markup).toMatch(/^<html lang="ar" dir="rtl"[ >]/);
    expect(elements(markup, "title").map(({ inner }) => inner)).toStrictEqual([ar.errors.global]);
  });

  it("says it in Arabic first, under the page's one h1, then in English as its twin at h2", () => {
    const sections = elements(markup, "section");
    expect(sections.map(({ attributes }) => attributes.match(/^ lang="(\w+)" dir="(\w+)"/)?.slice(1))).toStrictEqual([
      ["ar", "rtl"],
      ["en", "ltr"],
    ]);
    expect(elements(markup, "h1").map(({ inner }) => inner)).toStrictEqual([ar.errors.global]);
    expect(elements(sections[0]?.inner ?? "", "h1")).toHaveLength(1);
    expect(elements(sections[1]?.inner ?? "", "h2").map(({ inner }) => inner)).toStrictEqual([en.errors.global]);
  });

  it("has a reload button in each language", () => {
    for (const [index, locale] of (["ar", "en"] as const).entries()) {
      const buttons = elements(elements(markup, "section")[index]?.inner ?? "", "button");
      expect(buttons, locale).toHaveLength(1);
      expect(buttons[0]?.inner, locale).toContain(CATALOGS[locale].common.reload);
    }
  });
});
