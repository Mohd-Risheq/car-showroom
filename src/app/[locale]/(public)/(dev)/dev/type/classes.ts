// The specimen's styles, as Tailwind utilities: CSS Modules aren't scoped under D-014's loader rule.
// The five steps are DESIGN §3.3's, on §3.1's public colours. The raw values stand in for T-13's
// tokens.css, and nothing outside this page uses them. The font stacks (font-display and the rest)
// come from font-fallbacks.css; Arabic tracking, italics and case from globals.css.

export const C = {
  page: "min-h-svh bg-[#0b0d10] px-4 pt-8 pb-20 text-[#eef2f6] [color-scheme:dark] md:px-10",
  // Every grid track is minmax(0, 1fr): an auto track grows to its longest word, so a display word
  // wider than the phone would widen the page instead of staying in its slot
  frame: "mx-auto grid max-w-[76rem] grid-cols-[minmax(0,1fr)] gap-18",
  // Development chrome, in the system monospace, so it never reads as part of the specimen
  chrome: "flex flex-wrap items-baseline gap-x-6 gap-y-2 font-mono text-[0.8125rem] leading-normal text-[#a9b4c2]",
  link: "text-[#5cc8db] underline underline-offset-[0.2em]",
  section: "grid grid-cols-[minmax(0,1fr)] gap-10",
  sectionTitle: "font-mono text-[0.8125rem] leading-normal font-normal text-[#8592a3] rtl:text-right",
  step: "grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-baseline lg:gap-10",
  label: "font-mono text-[0.8125rem] leading-normal text-[#8592a3] [overflow-wrap:anywhere] rtl:text-right",
  labelName: "block font-normal text-[#a9b4c2]",
  // Where type-checks.tsx sets a sample again in its fallback font, hidden. A word wider than the
  // column is clipped here rather than widening the page, and the results report it.
  slot: "relative overflow-x-clip",

  display:
    "font-display text-[clamp(3.5rem,2rem+6vw,6rem)] leading-none font-semibold tracking-[-0.02em] text-balance [font-variation-settings:'HEXP'_100] [&:lang(ar)]:leading-[1.25]",
  head: "font-head text-[clamp(2rem,1.3rem+3.2vw,4rem)] leading-[1.1] font-semibold text-balance [font-variation-settings:'HEXP'_60] [&:lang(ar)]:leading-[1.35]",
  lead: "font-lead text-[clamp(1.25rem,1.1rem+0.6vw,1.625rem)] leading-[1.35] font-normal text-[#a9b4c2] [font-variation-settings:'HEXP'_20] [&:lang(ar)]:leading-[1.6]",
  body: "max-w-[65ch] text-[clamp(1.0625rem,1rem+0.25vw,1.1875rem)] leading-normal font-normal [font-variation-settings:'HEXP'_0] [&:lang(ar)]:text-[calc(clamp(1.0625rem,1rem+0.25vw,1.1875rem)*1.06)] [&:lang(ar)]:leading-[1.8]",
  small:
    "max-w-[65ch] text-[clamp(0.8125rem,0.775rem+0.15vw,0.875rem)] leading-[1.4] font-normal text-[#8592a3] [&:lang(ar)]:leading-[1.6]",
  // Figures: Martian Mono at wdth 87.5, wght 450, tabular (DESIGN §3.3)
  figure: "font-figures font-stretch-[87.5%] [font-weight:450] tabular-nums",

  facts: "m-0 grid gap-x-8 gap-y-1 sm:grid-cols-[max-content_max-content]",
  factTerm: "pt-2 text-[#a9b4c2] sm:py-1.5",
  factValue: "m-0 sm:py-1.5",

  // Checks: measured by type-checks.tsx, on a tone step so they read as fixtures
  checks: "grid grid-cols-[minmax(0,1fr)] gap-10 rounded-xl bg-[#12161b] px-4 py-6 md:p-8",
  fixture: "grid grid-cols-[minmax(0,1fr)] gap-3",
  rows: "grid gap-2 overflow-x-auto overscroll-x-contain",
  row: "flex items-baseline gap-4",
  rowLabel: "w-30 flex-none font-mono text-xs leading-normal text-[#8592a3] rtl:text-right",
  sample: "inline-block whitespace-nowrap",
  digit: "inline-block outline-1 -outline-offset-1 outline-[#66778e]/55",

  results: "grid grid-cols-[minmax(0,1fr)] gap-4 font-mono text-[0.8125rem] leading-normal text-[#a9b4c2]",
  table: "border-collapse text-start",
  cell: "border-b border-[#66778e]/45 py-1.5 pe-6 text-start align-baseline",
  headCell: "border-b border-[#66778e]/45 py-1.5 pe-6 text-start align-baseline font-normal text-[#8592a3]",
  pass: "text-[#5cc8db]",
  fail: "text-[#e87470]",
  json: "max-h-96 overflow-x-auto rounded-lg bg-[#0b0d10] p-4 text-xs whitespace-pre",
} as const;
