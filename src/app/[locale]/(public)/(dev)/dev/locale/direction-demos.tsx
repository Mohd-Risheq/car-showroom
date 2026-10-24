import { ArrowRightIcon, CaretLeftIcon, PlayIcon } from "@phosphor-icons/react/ssr";
import { getTranslations } from "next-intl/server";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollFrame } from "@/components/ui/scroll-frame";

// Direction in each language, which tests/e2e/locale.spec.ts checks in every engine: free text that
// reads in the direction of what is typed (NFR-I18N-04), with a placeholder and without, a VIN field
// fixed left to right, arrows that mirror in Arabic beside a play glyph that doesn't (FR-01.7), a long
// Arabic word in a flex item of a narrow box, which no width of its own holds (FR-01 edge cases), and
// the same word in a table, which keeps it whole and scrolls in its frame, as DESIGN's panel table does.

/** "Electromagnetic", one of the longest everyday Arabic words, which no 64 px box holds */
const LONG_WORD = "الكهرومغناطيسية";

export async function DirectionDemos() {
  const [nav, palette, dashboard, field] = await Promise.all([
    getTranslations("nav"),
    getTranslations("palette"),
    getTranslations("dashboard"),
    getTranslations("field"),
  ]);

  return (
    <section className="grid max-w-measure gap-6">
      <Field id="free-text" label={nav("search")}>
        <Input placeholder={palette("placeholder")} />
      </Field>
      <Field id="free-text-bare" label={dashboard("search")}>
        <Input />
      </Field>
      <Field id="vin" label={field("vin")} dir="ltr">
        <Input autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
      </Field>
      <div className="grid gap-2">
        <label htmlFor="description">{field("description")}</label>
        {/* No resize grip, whose ink in the end corner would read as text */}
        <textarea
          id="description"
          rows={3}
          className="w-full resize-none rounded-input border border-line bg-surface-2 px-3 py-2 text-ink"
        />
      </div>
      <p aria-hidden="true" className="flex gap-4">
        <ArrowRightIcon data-icon="next" className="size-icon rtl:-scale-x-100" />
        <CaretLeftIcon data-icon="back" className="size-icon rtl:-scale-x-100" />
        <PlayIcon data-icon="play" className="size-icon" />
      </p>
      <div data-long-word className="flex w-16 border border-line">
        <p lang="ar">{LONG_WORD}</p>
      </div>
      <ScrollFrame data-table-frame label="A long word in a table" lang="en" className="w-16 border border-line">
        <table>
          <tbody>
            <tr>
              <td lang="ar">{LONG_WORD}</td>
            </tr>
          </tbody>
        </table>
      </ScrollFrame>
    </section>
  );
}
