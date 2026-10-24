import { ESLint, RuleTester } from "eslint";
import { describe, expect, it } from "vitest";
import rule from "../../../scripts/eslint/logical-properties.mjs";

// DESIGN §3.4: logical properties only. A class, an arbitrary property or a style that sets a left or
// right side fails; the logical twins, the shorthands for both sides and prose pass.

RuleTester.describe = describe;
RuleTester.it = it;
const tester = new RuleTester({ languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } } });

const physical = (value: string, logical: string) => ({ messageId: "physical", data: { value, logical } });
const MARGIN = "ms-* or me-*";
const INSET = "start-* or end-*";
const HALF_INSET = "inset-x-0 mx-auto w-fit, or start-1/2 with rtl:translate-x-1/2 beside -translate-x-1/2";
const SIDE = "start or end";

tester.run("logical-properties", rule, {
  valid: [
    "<div className='ms-4 me-auto ps-page pe-2 start-0 end-4 text-start text-end float-start clear-end' />",
    "<div className='border-s border-e-2 border-s-line rounded-s rounded-ee-input scroll-ms-4 scroll-pe-2' />",
    // Both sides at once, and lines that name no side
    "<div className='mx-4 px-page inset-x-0 border-x border-line border-t rounded-full -translate-x-1/2' />",
    // A box centred in both directions
    "<div className='absolute inset-x-0 mx-auto w-fit' />",
    "<div className='absolute start-1/2 -translate-x-1/2 rtl:translate-x-1/2' />",
    "<div className='[margin-inline-start:auto] [inset-inline-end:0] [text-align:start]' />",
    // Prose and language tags, which only look like classes
    "const DIRECTION = 'left-to-right', MARATHI = 'mr-IN', POLISH = 'pl-PL';",
    "<div style={{ marginInlineStart: 8, insetInlineEnd: 0, textAlign: 'start', float: 'inline-end' }} />",
    "<div style={{ borderStartStartRadius: 0, '--left': 'var(--spacing-page)' }} />",
    // Not a style: an object such as a toaster's offsets
    "const offset = { left: 'var(--spacing-page)', right: 'var(--spacing-page)' };",
  ],
  invalid: [
    {
      code: "<div className='ml-4 -mr-2 md:hover:ml-auto' />",
      errors: [physical("ml-4", MARGIN), physical("-mr-2", MARGIN), physical("ml-auto", MARGIN)],
    },
    {
      code: "<div className='pl-page pr-[3%] scroll-ml-4 scroll-pr-2' />",
      errors: [
        physical("pl-page", "ps-* or pe-*"),
        physical("pr-[3%]", "ps-* or pe-*"),
        physical("scroll-ml-4", "scroll-ms-*, scroll-me-*, scroll-ps-* or scroll-pe-*"),
        physical("scroll-pr-2", "scroll-ms-*, scroll-me-*, scroll-ps-* or scroll-pe-*"),
      ],
    },
    {
      code: "<div className='left-0 -right-4 !right-(--offset) left-1/3' />",
      errors: [
        physical("left-0", INSET),
        physical("-right-4", INSET),
        physical("right-(--offset)", INSET),
        physical("left-1/3", INSET),
      ],
    },
    {
      // A half inset centres a box only with a translate, which doesn't mirror. A negative one pulls
      // the box half outside its parent and centres nothing, so it gets its logical twin.
      code: "<div className='left-1/2 -translate-x-1/2 rtl:left-1/2 right-[50%] -right-1/2' />",
      errors: [
        physical("left-1/2", HALF_INSET),
        physical("left-1/2", HALF_INSET),
        physical("right-[50%]", HALF_INSET),
        physical("-right-1/2", INSET),
      ],
    },
    {
      // Variants cut at a colon, counted in UTF-16 units however many a character before it takes
      code: `<div className='${String.fromCodePoint(0x1f600)}:ml-4 [&[data-x="${String.fromCodePoint(0x1f600)}"]]:mr-2' />`,
      errors: [physical("ml-4", MARGIN), physical("mr-2", MARGIN)],
    },
    {
      code: "<p className='[&:lang(ar)]:text-right text-left float-right clear-left' />",
      errors: [
        physical("text-right", "text-start or text-end"),
        physical("text-left", "text-start or text-end"),
        physical("float-right", "float-start or float-end"),
        physical("clear-left", "clear-start or clear-end"),
      ],
    },
    {
      code: "<div className='border-l border-r-2 border-l-line rounded-r rounded-tl-input rounded-br' />",
      errors: [
        physical("border-l", "border-s or border-e"),
        physical("border-r-2", "border-s or border-e"),
        physical("border-l-line", "border-s or border-e"),
        ...["rounded-r", "rounded-tl-input", "rounded-br"].map((value) =>
          physical(value, "rounded-s, rounded-e, rounded-ss, rounded-se, rounded-es or rounded-ee"),
        ),
      ],
    },
    {
      code: "const classes = cn(`${base} [margin-left:auto]`, '[left:0] [border-right-width:2px] [text-align:right]', '[border-top-left-radius:0]');",
      errors: [
        physical("[margin-left:auto]", "the -inline-start or -inline-end property"),
        physical("[left:0]", "inset-inline-start or inset-inline-end"),
        physical("[border-right-width:2px]", "the -inline-start or -inline-end property"),
        physical("[text-align:right]", SIDE),
        physical("[border-top-left-radius:0]", "border-start-start-radius and its kin"),
      ],
    },
    {
      code: "<div style={{ marginLeft: 8, left: 0, paddingRight: '1rem', borderLeftColor: 'var(--line)', borderTopRightRadius: 0 }} />",
      errors: [
        physical("marginLeft", "the InlineStart or InlineEnd property"),
        physical("left", "insetInlineStart or insetInlineEnd"),
        physical("paddingRight", "the InlineStart or InlineEnd property"),
        physical("borderLeftColor", "the InlineStart or InlineEnd property"),
        physical("borderTopRightRadius", "borderStartStartRadius and its kin"),
      ],
    },
    {
      code: "<div style={{ textAlign: rtl ? 'right' : 'left', float: 'left' }} />",
      errors: [physical("textAlign: right", SIDE), physical("textAlign: left", SIDE), physical("float: left", SIDE)],
    },
  ],
});

describe("the project's ESLint config", () => {
  const eslint = new ESLint();
  const ruleOf = async (filePath: string, code: string) => {
    const [result] = await eslint.lintText(code, { filePath });
    return (result?.messages ?? []).filter(({ ruleId }) => ruleId === "muftah/logical-properties").length;
  };

  it("holds shipped code to logical properties, and leaves the development pages their own", async () => {
    const code = 'export const C = "ms-4 text-right";\n';
    expect(await ruleOf("src/components/ui/panel.tsx", code)).toBe(1);
    expect(await ruleOf("src/features/inventory/ui/card.ts", code)).toBe(1);
    expect(await ruleOf("src/app/[locale]/(public)/(dev)/dev/spin/panel.tsx", code)).toBe(0);
    expect(await ruleOf("src/app/_dev/specimen/panel.tsx", code)).toBe(0);
  });

  it("reads a style object through `as` and `satisfies`, and one typed as CSSProperties", async () => {
    const style = (declaration: string) =>
      ruleOf("src/components/ui/panel.tsx", `import type { CSSProperties } from "react";\n${declaration}\n`);
    expect(await style("export const a = <div style={{ left: 0 } as CSSProperties} />;")).toBe(1);
    expect(await style("export const b = <div style={{ textAlign: 'right' as const }} />;")).toBe(1);
    expect(await style("export const c: CSSProperties = { marginRight: 0, right: 0 };")).toBe(2);
    // Outside JSX, where only the type says it is a style
    expect(await style("export const s = { left: 0 } satisfies CSSProperties;")).toBe(1);
    expect(await style("export const t = { left: 0 } as CSSProperties;")).toBe(1);
    // An object that isn't a style is data, such as Sonner's offsets
    expect(await style("export const d = { left: 0, right: 0 };")).toBe(0);
  });
});
