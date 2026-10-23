import { ESLint, RuleTester } from "eslint";
import { describe, expect, it } from "vitest";
import rule from "../../../scripts/eslint/no-raw-style-values.mjs";

// T-13's Done when, held by the tokens-only check: a colour, a length, a time or a curve written
// into a class, a style or a colour attribute fails, and so does a line height that bypasses the type
// steps; tokens, var(), layout values and values computed at run time pass.

RuleTester.describe = describe;
RuleTester.it = it;
const tester = new RuleTester({ languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } } });

const raw = (kind: string, value: string) => ({ messageId: "raw", data: { kind, value } });
const number = (value: number) => ({ messageId: "number", data: { value: String(value) } });
const leading = (value: string) => ({ messageId: "leading", data: { value } });

tester.run("no-raw-style-values", rule, {
  valid: [
    "<div className='bg-surface-1 p-page text-ink duration-(--dur-modal) ease-out rounded-input' />",
    "<p className='type-body leading-none' />",
    "<div className='w-(--size) bg-(--accent) outline-(length:--focus-ring-width)' />",
    "<div className='grid-cols-[minmax(0,1fr)] aspect-[4/3] max-h-[calc(100dvh-(--spacing(12)))] w-[37%]' />",
    "<div className='pb-[calc(var(--spacing-page)+env(safe-area-inset-bottom))] [&:lang(ar)]:text-right' />",
    "<div className='data-[state=open]:block [overflow-wrap:anywhere] m-[0px] delay-[0s]' />",
    "const SELECTOR = '[data-scrub-line]', LINK = 'a[href^=\"#top\"]';",
    "<path d='M1 12h318' stroke='currentColor' fill='none' strokeWidth={1.5} />",
    // Only colour attributes hold colours: references, links and text pass
    "<rect mask='url(#fade)' fill='url(#cafe)' />",
    "<a href='#add'>Add</a>",
    "<img alt='A white car, stock #123' />",
    "<animate fill='freeze' />",
    "<Badge color='warn' />",
    "<div style={{ rotate: 'calc(tan(45deg) * 1turn)' }} />",
    "<div style={{ transform: `translateY(${offset}px)`, aspectRatio: `${width} / ${height}` }} />",
    "<div style={{ fontFamily: 'inherit', opacity: 0, flexGrow: 1, width: size, color: 'var(--ink)' }} />",
    "<div style={{ zIndex: 10, order: -1, flexGrow: 2, gridColumn: 3, aspectRatio: 1.5, 'zIndex': 2 }} />",
    "const theme = { '--accent': 'var(--scan)' };",
    "element.style.setProperty('--x', 'var(--spacing-page)');",
    "const canvasFallback = '#000';",
  ],
  invalid: [
    {
      code: "<div className='bg-[#0b0d10] text-[#EEF2F6]' />",
      errors: [raw("colour", "#0b0d10"), raw("colour", "#EEF2F6")],
    },
    {
      code: "<div className='w-[37px] text-[0.8rem] tracking-[-0.02em]' />",
      errors: [raw("length", "37px"), raw("length", "0.8rem"), raw("length", "0.02em")],
    },
    {
      code: "<div className='shadow-[0_4px_12px_rgba(0,0,0,0.3)]' />",
      errors: [raw("colour", "rgba(0,0,0,0.3)"), raw("length", "4px"), raw("length", "12px")],
    },
    {
      code: "<div className='duration-[250ms] ease-[cubic-bezier(0.2,0,0,1)]' />",
      errors: [raw("time", "250ms"), raw("curve", "cubic-bezier(0.2,0,0,1)")],
    },
    {
      code: "<div className='max-[600px]:hidden [--dur-pop:0.2s]' />",
      errors: [raw("length", "600px"), raw("time", "0.2s")],
    },
    { code: "const C = { link: 'text-[#5cc8db] underline' };", errors: [raw("colour", "#5cc8db")] },
    { code: "const C = cn(`w-[720px] ${open ? 'block' : 'hidden'}`);", errors: [raw("length", "720px")] },
    {
      code: "<div style={{ width: 123, height: -8, background: '#5CC8DB' }} />",
      errors: [number(123), number(-8), raw("colour", "#5CC8DB")],
    },
    {
      code: "<div style={{ opacity: 0.4, fontWeight: 600, lineHeight: 1.5, '--count': 3 }} />",
      errors: [number(0.4), number(600), number(1.5), number(3)],
    },
    {
      code: "<div style={{ fontSize: wide ? '2.5rem' : '1.25rem', color: muted || '#8592a3' }} />",
      errors: [raw("length", "2.5rem"), raw("length", "1.25rem"), raw("colour", "#8592a3")],
    },
    { code: "<div style={{ boxShadow: `0 0 12px ${colour}` }} />", errors: [raw("length", "12px")] },
    { code: "<div style={{ '--bg': '#0b0d10' }} />", errors: [raw("colour", "#0b0d10")] },
    {
      code: "const THEME = { '--bg': '#0B0D10', '--line': 'oklch(0.6 0.03 250)' };",
      errors: [raw("colour", "#0B0D10"), raw("colour", "oklch(0.6 0.03 250)")],
    },
    {
      code: "<rect fill='#fff' stroke='rgb(0, 0, 0)' />",
      errors: [raw("colour", "#fff"), raw("colour", "rgb(0, 0, 0)")],
    },
    // A colour attribute written in braces, or as a choice
    {
      code: "<rect fill={'#fff'} stroke={on ? '#5cc8db' : '#66778e'} />",
      errors: [raw("colour", "#fff"), raw("colour", "#5cc8db"), raw("colour", "#66778e")],
    },
    // A style object inside a choice
    {
      code: "<div style={open ? { height: '320px' } : undefined} className={cn(wide && { color: 'red' })} />",
      errors: [raw("length", "320px")],
    },
    { code: "<div style={visible && { color: '#fff' }} />", errors: [raw("colour", "#fff")] },
    // Named colours
    {
      code: "<rect fill='white' style={{ color: 'Black' }} className='bg-[white] [color:red]' />",
      errors: [raw("colour", "white"), raw("colour", "Black"), raw("colour", "white"), raw("colour", "red")],
    },
    // A custom property set through the style declaration
    { code: "element.style.setProperty('--x', '37px');", errors: [raw("length", "37px")] },
    // Lengths in the line and character units
    {
      code: "<div className='mt-[1lh] gap-[0.5cap] w-[3ic] h-[2rlh]' />",
      errors: [raw("length", "1lh"), raw("length", "0.5cap"), raw("length", "3ic"), raw("length", "2rlh")],
    },
    // A line height on the spacing scale, which ignores the type steps and Arabic's own
    { code: "<p className='leading-6 md:leading-7' />", errors: [leading("leading-6"), leading("md:leading-7")] },
  ],
});

describe("the project's ESLint config", () => {
  const eslint = new ESLint();
  const ruleOf = async (filePath: string, code: string) => {
    const [result] = await eslint.lintText(code, { filePath });
    return (result?.messages ?? []).filter(({ ruleId }) => ruleId === "muftah/no-raw-style-values").length;
  };

  it("holds shipped code and the development pages to the tokens", async () => {
    const code = 'export const C = "max-w-[720px]";\n';
    expect(await ruleOf("src/components/ui/panel.tsx", code)).toBe(1);
    expect(await ruleOf("src/app/[locale]/(public)/(dev)/dev/spin/panel.tsx", code)).toBe(1);
    expect(await ruleOf("src/app/_dev/specimen/panel.tsx", code)).toBe(1);
  });

  it("reads a style object through `as` and `satisfies`, and one typed as CSSProperties", async () => {
    const style = (declaration: string) =>
      ruleOf("src/components/ui/panel.tsx", `import type { CSSProperties } from "react";\n${declaration}\n`);
    expect(await style("export const a = <div style={{ width: 37 } as CSSProperties} />;")).toBe(1);
    expect(await style("export const b = <div style={{ color: '#fff' } satisfies CSSProperties} />;")).toBe(1);
    expect(await style("export const c: CSSProperties = { backgroundSize: '3px 3px' };")).toBe(2);
    expect(await style("export const d = { padding: '13px' } as React.CSSProperties;")).toBe(1);
    // An object that isn't a style is data
    expect(await style("export const e = { padding: '13px' };")).toBe(0);
  });
});
