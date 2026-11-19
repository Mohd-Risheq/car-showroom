import { describe, expect, it } from "vitest";
import { beforeSign, isolate, isolateScripts } from "@/lib/i18n/bidi";
import {
  FIRST_STRONG_ISOLATE,
  LEFT_TO_RIGHT_ISOLATE,
  LEFT_TO_RIGHT_MARK,
  POP_DIRECTIONAL_ISOLATE,
  RIGHT_TO_LEFT_ISOLATE,
} from "../../support/marks";

// FR-01.8: a value inside a message sits in a first-strong isolate, and a name a dealer types in
// either script has each script's part in an isolate of its direction (DESIGN §10.3)

/** The text in a left-to-right isolate, and in a right-to-left one */
const ltr = (text: string) => `${LEFT_TO_RIGHT_ISOLATE}${text}${POP_DIRECTIONAL_ISOLATE}`;
const rtl = (text: string) => `${RIGHT_TO_LEFT_ISOLATE}${text}${POP_DIRECTIONAL_ISOLATE}`;

describe("isolate", () => {
  it("opens a first-strong isolate before the text and closes it after", () => {
    expect(isolate("Chrome on macOS")).toBe(`${FIRST_STRONG_ISOLATE}Chrome on macOS${POP_DIRECTIONAL_ISOLATE}`);
    expect(isolate("سفاري")).toBe(`${FIRST_STRONG_ISOLATE}سفاري${POP_DIRECTIONAL_ISOLATE}`);
  });
});

describe("beforeSign", () => {
  it("puts a left-to-right mark before a number that its message follows with a sign", () => {
    expect(beforeSign("91")).toBe(`${LEFT_TO_RIGHT_MARK}91`);
  });
});

describe("isolateScripts", () => {
  it("isolates a Latin name left to right, with the sign it ends in and the number it starts with", () => {
    expect(isolateScripts("Crozz Pure+")).toBe(ltr("Crozz Pure+"));
    expect(isolateScripts("2.0 CRDi")).toBe(ltr("2.0 CRDi"));
    expect(isolateScripts("300h")).toBe(ltr("300h"));
  });

  it("isolates each Latin part and each Arabic part in its own direction (DESIGN §10.3)", () => {
    expect(isolateScripts("E 300 AMG لاين نايت باكيج كوبيه")).toBe(
      `${ltr("E 300 AMG")} ${rtl("لاين نايت باكيج كوبيه")}`,
    );
    expect(isolateScripts("فل كامل GXR")).toBe(`${rtl("فل كامل")} ${ltr("GXR")}`);
    expect(isolateScripts("فل كامل")).toBe(rtl("فل كامل"));
  });

  it("keeps a number or a sign inside its part, at an end with the part beside it, between parts outside", () => {
    expect(isolateScripts("AMG - Line")).toBe(ltr("AMG - Line"));
    expect(isolateScripts("Crozz Pure +")).toBe(ltr("Crozz Pure +"));
    expect(isolateScripts("GXR - فل كامل")).toBe(`${ltr("GXR")} - ${rtl("فل كامل")}`);
    expect(isolateScripts("فل 2 GXR")).toBe(`${rtl("فل")} 2 ${ltr("GXR")}`);
  });

  it("counts a word with an Arabic letter as Arabic, and keeps the spaces as they are", () => {
    expect(isolateScripts("GXR (فل كامل)")).toBe(`${ltr("GXR")} ${rtl("(فل كامل)")}`);
    expect(isolateScripts(" C-ماكس  2 ")).toBe(` ${rtl("C-ماكس  2")} `);
  });

  it("leaves text with a letter of neither script as it is", () => {
    expect(isolateScripts("+ / 2")).toBe("+ / 2");
    expect(isolateScripts("")).toBe("");
  });
});
