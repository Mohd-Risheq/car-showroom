import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Quantity } from "@/components/ui/quantity";
import type { UnitNames } from "@/lib/format/units";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import { NO_BREAK_SPACE } from "../../support/marks";

// DESIGN §9.4 and §9.5: the number in a left-to-right isolate, a no-break space, then the unit, which
// screen readers hear by its spoken name where it has one

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

  it("sets the number alone in figures, so a unit in Arabic letters keeps the text's face", () => {
    expect(renderToStaticMarkup(<Quantity value={14500} unit="jod" names={AR} figures />)).toBe(
      `<span class="whitespace-nowrap"><bdi dir="ltr" class="figures">14,500</bdi>${NO_BREAK_SPACE}` +
        `<span aria-hidden="true">د.أ</span><span class="sr-only">دينار أردني</span></span>`,
    );
  });

  it("gives the unit the caller's classes, whether screen readers hear its spoken name or it is shown to all", () => {
    expect(renderToStaticMarkup(<Quantity value={14500} unit="jod" names={EN} unitClassName="text-muted" />)).toBe(
      `<span class="whitespace-nowrap"><bdi dir="ltr">14,500</bdi>${NO_BREAK_SPACE}` +
        `<span aria-hidden="true" class="text-muted">JOD</span><span class="sr-only">Jordanian dinars</span></span>`,
    );
    expect(renderToStaticMarkup(<Quantity value={2.487} unit="litre" names={AR} unitClassName="text-muted" />)).toBe(
      `<span class="whitespace-nowrap"><bdi dir="ltr">2.5</bdi>${NO_BREAK_SPACE}<span class="text-muted">لتر</span></span>`,
    );
  });

  it("gives the number the caller's classes, beside its figures' own", () => {
    expect(
      renderToStaticMarkup(<Quantity value={14500} unit="jod" names={EN} figures amountClassName="line-through" />),
    ).toMatch(/^<span class="whitespace-nowrap"><bdi dir="ltr" class="figures line-through">14,500<\/bdi>/);
    expect(
      renderToStaticMarkup(<Quantity value={14500} unit="jod" names={EN} amountClassName="line-through" />),
    ).toMatch(/^<span class="whitespace-nowrap"><bdi dir="ltr" class="line-through">14,500<\/bdi>/);
  });

  it("adds the caller's classes", () => {
    expect(renderToStaticMarkup(<Quantity value={203} unit="hp" names={EN} className="figures" />)).toMatch(
      /^<span class="whitespace-nowrap figures">/,
    );
  });
});
