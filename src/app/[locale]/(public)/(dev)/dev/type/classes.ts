// The specimen's styles, as Tailwind utilities on the tokens: CSS Modules aren't scoped under D-014's
// loader rule. The five steps are DESIGN §3.3's type-* utilities, on §3.1's public colours; Arabic
// tracking, italics and case come from globals.css.

export const C = {
  page: "min-h-svh bg-bg px-4 pt-8 pb-20 text-ink md:px-10",
  // Every grid track is minmax(0, 1fr): an auto track grows to its longest word, so a display word
  // wider than the phone would widen the page instead of staying in its slot
  frame: "mx-auto grid max-w-304 grid-cols-[minmax(0,1fr)] gap-18",
  // Development chrome, in the system monospace, so it never reads as part of the specimen
  chrome: "flex flex-wrap items-baseline gap-x-6 gap-y-2 font-mono text-xs text-muted",
  link: "text-scan underline underline-offset-2",
  section: "grid grid-cols-[minmax(0,1fr)] gap-10",
  sectionTitle: "font-mono text-xs font-normal text-meta rtl:text-right",
  step: "grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[--spacing(60)_minmax(0,1fr)] lg:items-baseline lg:gap-10",
  label: "font-mono text-xs text-meta [overflow-wrap:anywhere] rtl:text-right",
  labelName: "block font-normal text-muted",
  // Where type-checks.tsx sets a sample again in its fallback font, hidden. A word wider than the
  // column is clipped here rather than widening the page, and the results report it.
  slot: "relative overflow-x-clip",

  display: "type-display",
  head: "type-head",
  lead: "type-lead text-muted",
  body: "type-body max-w-measure",
  small: "type-small max-w-measure text-meta",
  figure: "figures",

  facts: "m-0 grid gap-x-8 gap-y-1 md:grid-cols-[max-content_max-content]",
  factTerm: "pt-2 text-muted md:py-2",
  factValue: "m-0 md:py-2",

  // Checks: measured by type-checks.tsx, on a tone step so they read as fixtures
  checks: "grid grid-cols-[minmax(0,1fr)] gap-10 bg-surface-1 px-4 py-6 md:p-8",
  fixture: "grid grid-cols-[minmax(0,1fr)] gap-3",
  rows: "grid gap-2 overflow-x-auto overscroll-x-contain",
  row: "flex items-baseline gap-4",
  rowLabel: "w-30 flex-none font-mono text-xs text-meta rtl:text-right",
  sample: "inline-block whitespace-nowrap",
  digit: "inline-block outline-1 -outline-offset-1 outline-line/55",

  results: "grid grid-cols-[minmax(0,1fr)] gap-4 font-mono text-xs text-muted",
  table: "border-collapse text-start",
  cell: "border-b border-line/45 py-2 pe-6 text-start align-baseline",
  headCell: "border-b border-line/45 py-2 pe-6 text-start align-baseline font-normal text-meta",
  pass: "text-scan",
  fail: "text-fail",
  json: "max-h-96 overflow-x-auto bg-bg p-4 text-xs whitespace-pre",
} as const;
