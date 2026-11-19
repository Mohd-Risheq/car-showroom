import { ESLint, RuleTester } from "eslint";
import { describe, expect, it } from "vitest";
import rule from "../../../scripts/eslint/no-raw-style-values.mjs";

// T-13's Done when, held by the tokens-only check: a colour, a length, a time or a curve written
// into a class, a style or a colour attribute fails, as one written into what Motion or the Web
// Animations API animates does, and so does a line height that bypasses the type steps, spacing off
// the 4 px base, or a scale off the motion tokens; tokens, var(), layout values and values computed
// at run time pass.

RuleTester.describe = describe;
RuleTester.it = it;
const tester = new RuleTester({ languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } } });

const raw = (kind: string, value: string) => ({ messageId: "raw", data: { kind, value } });
const number = (value: number) => ({ messageId: "number", data: { value: String(value) } });
const leading = (value: string) => ({ messageId: "leading", data: { value } });
const offBase = (value: string) => ({ messageId: "offBase", data: { value } });
const scale = (value: string) => ({ messageId: "scale", data: { value } });

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
    // Whole steps of spacing, and sizes, which may take a fraction or 1 px, as a thin line does
    "<div className='p-1 -mt-1 gap-x-2 md:py-2 inset-x-0 translate-y-1/2 h-0.5 w-px size-3.5 min-h-0.5' />",
    "<div className='px-4 pbs-2 mbe-4 inset-s-0 inset-be-1 translate-x-full translate-z-2 scroll-pbs-2 h-px max-w-px' />",
    "<table className='border-spacing-2 border-spacing-y-1 -indent-4' />",
    // A scale from a motion token, no scale, and a mirror, as an icon's in Arabic
    "<div className='data-pressed:scale-(--press-scale) motion-safe:in-data-starting-style:scale-(--entry-scale)' />",
    "<svg className='scale-100 rtl:-scale-x-100 scale-y-100 transform-3d' />",
    // What Motion and the Web Animations API animate, from tokens or computed
    "sheet.animate({ translate: [from, to], opacity: [0, 1] }, { duration: easing.duration, easing: easing.css });",
    "el.animate([{ opacity: 0, offset: 0.4 }, { opacity: 1 }], { duration: DURATIONS.pop, fill: 'both', iterations: 2 });",
    "el.animate({ transform: ['none', `translateX(${x}px)`] }, { easing: 'linear', duration: 0 });",
    "<m.div initial={false} animate={{ x: offset, scale: PRESS_SCALE, opacity: 1 }} transition={SPRINGS.move} />",
    "<motion.div animate='shown' variants={VARIANTS} transition={{ ...SPRINGS.flick, type: 'spring', repeat: Infinity, times: [0, 0.5, 1] }} />",
    "<MotionConfig transition={{ duration: seconds(DURATIONS.pop), ease: CURVES.out }} />",
    // Timing that counts or bounds: a stagger's direction, an iteration's start, an inertia's reach
    "<m.ul transition={{ staggerDirection: 1, staggerChildren: seconds(DURATIONS.stagger) }} />",
    "<m.div transition={{ type: 'inertia', power: 0.8, min: 0, max: 100 }} />",
    "el.animate(frames, { iterationStart: 0.5, iterations: 2, duration: DURATIONS.pop });",
    // A keyframe's offset places it, in a list of keyframes or indexed by property
    "el.animate({ opacity: [0, 1], offset: [0, 0.4] }, timing);",
    // Props of the same names on anything else are its own
    "<Other animate={{ x: 48 }} transition={{ duration: 0.3 }} />",
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
    // A scale off the motion tokens, with any variant, axis, sign or importance
    {
      code: "<div className='scale-97 hover:scale-105 motion-safe:in-data-starting-style:scale-95 -scale-y-50 scale-x-0 !scale-110 scale-125!' />",
      errors: [
        scale("scale-97"),
        scale("hover:scale-105"),
        scale("motion-safe:in-data-starting-style:scale-95"),
        scale("-scale-y-50"),
        scale("scale-x-0"),
        scale("!scale-110"),
        scale("scale-125!"),
      ],
    },
    // A line height on the spacing scale, which ignores the type steps and Arabic's own
    { code: "<p className='leading-6 md:leading-7' />", errors: [leading("leading-6"), leading("md:leading-7")] },
    // Spacing a fraction of a step, off the 4 px base, with any variant, sign or importance
    {
      code: "<div className='p-1.5 md:py-1.5 -mt-0.5 gap-x-2.5 space-y-0.5 translate-y-0.5 scroll-mt-1.5' />",
      errors: [
        offBase("p-1.5"),
        offBase("md:py-1.5"),
        offBase("-mt-0.5"),
        offBase("gap-x-2.5"),
        offBase("space-y-0.5"),
        offBase("translate-y-0.5"),
        offBase("scroll-mt-1.5"),
      ],
    },
    {
      code: "const C = `inset-0.25 data-[open]:ps-1.5 !me-2.5 top-0.5!`;",
      errors: [offBase("inset-0.25"), offBase("data-[open]:ps-1.5"), offBase("!me-2.5"), offBase("top-0.5!")],
    },
    // Every side and axis of padding and margin, physical and logical (DESIGN §3.4)
    {
      code: "<div className='px-0.5 pt-0.5 pr-0.5 pb-0.5 pl-0.5 pe-0.5 pbs-1.5 pbe-0.5 mx-0.5 my-0.5 mr-0.5 mb-0.5 ml-0.5 ms-0.5 mbs-1.5 mbe-0.5' />",
      errors: [
        offBase("px-0.5"),
        offBase("pt-0.5"),
        offBase("pr-0.5"),
        offBase("pb-0.5"),
        offBase("pl-0.5"),
        offBase("pe-0.5"),
        offBase("pbs-1.5"),
        offBase("pbe-0.5"),
        offBase("mx-0.5"),
        offBase("my-0.5"),
        offBase("mr-0.5"),
        offBase("mb-0.5"),
        offBase("ml-0.5"),
        offBase("ms-0.5"),
        offBase("mbs-1.5"),
        offBase("mbe-0.5"),
      ],
    },
    // Every side of a position and of inset, physical and logical, and inset's axes
    {
      code: "<div className='start-0.5 -end-1.5 bottom-0.5 left-0.5 right-0.5 inset-x-0.5 inset-y-0.5 inset-s-0.5 inset-e-1.5 inset-bs-0.5 inset-be-2.5' />",
      errors: [
        offBase("start-0.5"),
        offBase("-end-1.5"),
        offBase("bottom-0.5"),
        offBase("left-0.5"),
        offBase("right-0.5"),
        offBase("inset-x-0.5"),
        offBase("inset-y-0.5"),
        offBase("inset-s-0.5"),
        offBase("inset-e-1.5"),
        offBase("inset-bs-0.5"),
        offBase("inset-be-2.5"),
      ],
    },
    // Gap, space, translate and scroll spacing on each axis and side, translate's z axis among them, and
    // translate on both at once
    {
      code: "<div className='gap-0.5 gap-y-0.5 space-x-0.5 translate-0.5 -translate-1.5 translate-x-0.5 translate-z-0.5 -translate-z-1.5 scroll-m-0.5 scroll-p-0.5 scroll-px-0.5 scroll-mb-0.5 scroll-pbs-1.5 scroll-mbe-0.5' />",
      errors: [
        offBase("gap-0.5"),
        offBase("gap-y-0.5"),
        offBase("space-x-0.5"),
        offBase("translate-0.5"),
        offBase("-translate-1.5"),
        offBase("translate-x-0.5"),
        offBase("translate-z-0.5"),
        offBase("-translate-z-1.5"),
        offBase("scroll-m-0.5"),
        offBase("scroll-p-0.5"),
        offBase("scroll-px-0.5"),
        offBase("scroll-mb-0.5"),
        offBase("scroll-pbs-1.5"),
        offBase("scroll-mbe-0.5"),
      ],
    },
    // Border spacing, bare and on each axis, and text indent, which Tailwind 4 puts on the spacing
    // scale too
    {
      code: "<table className='border-spacing-1.5 border-spacing-x-0.5 border-spacing-y-px indent-0.5 -indent-px' />",
      errors: [
        offBase("border-spacing-1.5"),
        offBase("border-spacing-x-0.5"),
        offBase("border-spacing-y-px"),
        offBase("indent-0.5"),
        offBase("-indent-px"),
      ],
    },
    {
      code: "el.animate({ opacity: [0, 0.5], translate: ['0 12px', '0 0'] }, 300);",
      errors: [number(0.5), raw("length", "12px"), raw("time", "300")],
    },
    {
      code: "el.animate([{ color: '#fff' }, { color: 'var(--ink)' }], { duration: 250, easing: 'ease-out', delay: 40 });",
      errors: [raw("colour", "#fff"), raw("time", "250"), raw("curve", "ease-out"), raw("time", "40")],
    },
    {
      code: "el.animate(frames, { easing: 'cubic-bezier(0.2, 0, 0, 1)', endDelay: fast ? 0 : '0.5s' });",
      errors: [raw("curve", "cubic-bezier(0.2, 0, 0, 1)"), raw("time", "0.5s")],
    },
    {
      code: "<m.div initial={{ x: 0 }} animate={{ x: 48 }} exit={{ y: -8 }} transition={{ duration: 0.3 }} />",
      errors: [number(48), number(-8), raw("time", "0.3")],
    },
    {
      code: "<motion.div animate={{ scaleX: on ? 1 : 0.25, transition: { type: 'spring', bounce: 0.2, stiffness: 300 } }} />",
      errors: [number(0.25), number(0.2), number(300)],
    },
    {
      code: "<m.div transition={{ ease: [0.2, 0, 0, 1], x: { duration: 0.2 } }} variants={{ shown: { opacity: 0.8 } }} />",
      errors: [raw("curve", "[0.2, 0, 0, 1]"), raw("time", "0.2"), number(0.8)],
    },
    {
      code: "<MotionConfig transition={{ ease: 'easeOut', delay: 0.1 }} />",
      errors: [raw("curve", "easeOut"), raw("time", "0.1")],
    },
    // A colour attribute on a Motion component, in braces or as a choice
    {
      code: "<m.path fill={'#fff'} animate={{ pathLength: 1 }} />",
      errors: [raw("colour", "#fff")],
    },
    {
      code: "<motion.circle stroke={on ? '#5cc8db' : '#66778e'} />",
      errors: [raw("colour", "#5cc8db"), raw("colour", "#66778e")],
    },
    // An SVG's fill in a target, a variant or keyframes is its paint, not a fill mode, and so is
    // one a target sets as it ends
    {
      code: "<m.path animate={{ fill: '#e2a447', transitionEnd: { stroke: '#fff' } }} variants={{ on: { fill: '#000' } }} />",
      errors: [raw("colour", "#e2a447"), raw("colour", "#fff"), raw("colour", "#000")],
    },
    { code: "el.animate({ fill: ['#0b0d10', 'var(--ink)'] }, timing);", errors: [raw("colour", "#0b0d10")] },
    // A drag's transition: a bounce's physics at the bounds, and an inertia's time
    {
      code: "<m.div drag dragTransition={{ bounceStiffness: 600, bounceDamping: 20, timeConstant: 300 }} />",
      errors: [number(600), number(20), raw("time", "300")],
    },
    // 1 px, the px keyword, is off the base too
    {
      code: "<div className='p-px -mt-px gap-px top-px translate-y-px space-x-px inset-px scroll-mt-px' />",
      errors: [
        offBase("p-px"),
        offBase("-mt-px"),
        offBase("gap-px"),
        offBase("top-px"),
        offBase("translate-y-px"),
        offBase("space-x-px"),
        offBase("inset-px"),
        offBase("scroll-mt-px"),
      ],
    },
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
