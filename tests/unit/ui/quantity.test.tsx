import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Quantity } from "@/components/ui/quantity";
import type { UnitNames } from "@/lib/format/units";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";

// DESIGN §9.4 and §9.5: the number in a left-to-right isolate, a no-break space, then the unit, which
// screen readers hear by its spoken name where it has one

const NO_BREAK_SPACE = String.fromCodePoint(0xa0);
const AR: UnitNames = { locale: "ar", unit: ar.format.unit, spoken: ar.format.spoken };
const EN: UnitNames = { locale: "en", unit: en.format.unit, spoken: en.format.spoken };

describe("Quantity", () => {
  it("hides a short unit from screen readers and follows it with its spoken name", () => {
    expect(renderToStaticMarkup(<Quantity value={14500} unit="jod" names={AR} />)).toBe(
      `<span class="whitespace-nowrap"><bdi dir="ltr">14,500</bdi>${NO_BREAK_SPACE}` +
        `<span aria-hidden="true">د.أ</span><span class="sr-only">دينار أردني</span></span>`,
    );
    expect(renderToStaticMarkup(<Quantity value={1.36} unit="jodPerLitre" names={EN} />)).toBe(
      `<span class="whitespace-nowrap"><bdi dir="ltr">1.360</bdi>${NO_BREAK_SPACE}` +
        `<span aria-hidden="true">JOD/L</span><span class="sr-only">Jordanian dinars per litre</span></span>`,
    );
  });

  it("shows a unit without a spoken name to everyone", () => {
    expect(renderToStaticMarkup(<Quantity value={2.487} unit="litre" names={AR} />)).toBe(
      `<span class="whitespace-nowrap"><bdi dir="ltr">2.5</bdi>${NO_BREAK_SPACE}لتر</span>`,
    );
  });

  it("keeps a negative number's minus inside the isolate", () => {
    expect(renderToStaticMarkup(<Quantity value={-240} unit="micron" names={AR} />)).toContain(
      '<bdi dir="ltr">-240</bdi>',
    );
  });

  it("adds the caller's classes", () => {
    expect(renderToStaticMarkup(<Quantity value={203} unit="hp" names={EN} className="figures" />)).toMatch(
      /^<span class="whitespace-nowrap figures">/,
    );
  });
});
