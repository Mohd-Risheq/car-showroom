import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readTypeScale, TYPE_STEPS } from "@/styles/type-scale";

// How src/styles/type-scale.ts reads DESIGN §3.3's steps from tokens.css

/** A stylesheet that sets every step's tokens, with `extra` after them */
function sheet(extra = "") {
  const steps = TYPE_STEPS.map(
    (step) => `--${step}-size: 1rem; --${step}-weight: 400; --${step}-hexp: 0; --${step}-leading: 1.5;`,
  ).join("\n");
  return `:root {\n${steps}\n}\n${extra}`;
}

describe("readTypeScale", () => {
  it("reads each step in DESIGN's order, with Arabic taking the Latin value unless it sets its own", () => {
    const scale = readTypeScale(
      sheet(`[lang|="ar"] { --body-leading: 1.8; --body-scale: 1.06 }
:root, [lang|="en"] { --body-scale: 1; --display-tracking: -0.02em }`),
    );
    expect(scale.map((step) => step.id)).toStrictEqual(["display", "head", "subhead", "lead", "body", "small"]);
    const [display, , , , body] = scale;
    expect(body).toStrictEqual({
      id: "body",
      size: "1rem",
      weight: 400,
      hexp: 0,
      narrower: [],
      leading: { latin: "1.5", arabic: "1.8" },
      tracking: null,
      scale: { latin: "1", arabic: "1.06" },
    });
    expect(display?.tracking).toStrictEqual({ latin: "-0.02em", arabic: "-0.02em" });
  });

  it("lists the narrower HEXP each media or container condition sets, in the stylesheet's order", () => {
    const scale = readTypeScale(
      sheet(`@media (width < 33.75rem) { :root { --display-hexp: 80 } }
@media (prefers-contrast: more) { :root { --line: #8a9ab0 } }
@media (width < 26.875rem) { :root { --display-hexp: 60 } }
@container car-title (width >= 0px) { * { --display-room: calc(var(--display-room-share) * 1cqi) } }
@container model-name (width < 5.8514em) { * { --display-hexp: 20 } }
@container model-name (5.8446em <= width < 5.9787em) {
  [data-model="geely-geometry-c"]:lang(en), [data-model='geely-geometry-e']:lang(en) { --display-hexp: 0 }
}
@media (width < 20rem) { .other { --display-hexp: 0 } }
@media (width < 20rem) { [data-other="x"]:lang(en) { --display-hexp: 0 } }`),
    );
    // A long model name's, in its own container, as model-names.css sets it (D-049)
    const longName = (key: string) => ({
      at: "@container model-name (5.8446em <= width < 5.9787em)",
      selector: `[data-model="${key}"]:lang(en)`,
      hexp: 0,
    });
    expect(scale[0]?.narrower).toStrictEqual([
      { at: "@media (width < 33.75rem)", selector: ":root", hexp: 80 },
      { at: "@media (width < 26.875rem)", selector: ":root", hexp: 60 },
      { at: "@container model-name (width < 5.8514em)", selector: "*", hexp: 20 },
      longName("geely-geometry-c"),
      longName("geely-geometry-e"),
    ]);
    expect(scale[1]?.narrower).toStrictEqual([]);
  });

  it("throws when a step's token is missing or not a number, or the stylesheet can't be read", () => {
    expect(() => readTypeScale(sheet().replace("--small-weight: 400;", ""))).toThrow(
      "tokens.css sets no --small-weight on :root",
    );
    expect(() => readTypeScale(sheet().replace("--head-hexp: 0", "--head-hexp: var(--x)"))).toThrow(
      "--head-hexp is not a number: var(--x)",
    );
    expect(() => readTypeScale(`${sheet()}\n:root {`)).toThrow("tokens.css can't be read");
  });

  it("reads tokens.css itself", () => {
    const scale = readTypeScale(readFileSync("src/styles/tokens.css", "utf8"));
    expect(scale).toHaveLength(TYPE_STEPS.length);
    // The display step narrows its letters on phones by the screen (D-038), and in a car's title by
    // its model name's column (D-049)
    const places = new Set(scale[0]?.narrower.map(({ at }) => at.split(" (")[0]));
    expect(places).toStrictEqual(new Set(["@media", "@container model-name"]));
  });
});
