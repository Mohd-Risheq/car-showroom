import { Martian_Mono, Readex_Pro } from "next/font/google";

// The two families of DESIGN §3.3 (NFR-PERF-08), defined once so both root layouts share one copy.
// next/font downloads them at build time and serves them from this origin, so no page asks Google
// for anything (SRS §14, `font-src 'self'`).

// next/font's own fallback is one Arial face sized for Latin text at HEXP 0, so the wide steps and
// Arabic text would reflow when the font swaps in. src/styles/font-fallbacks.css has a set per type
// step and script instead (scripts/font-fallbacks.ts), so both fonts turn that fallback off.
// Turbopack (Next.js 16.4.2) ignores adjustFontFallback: false and drops its fallback face only
// when it is given a fallback list, so the list is empty (D-033).

// All text in both scripts, with the width axis (HEXP) of the display and head steps. The only font
// preloaded: its arabic and latin files.
export const readexPro = Readex_Pro({
  subsets: ["arabic", "latin"],
  axes: ["HEXP"],
  display: "swap",
  adjustFontFallback: false,
  fallback: [],
  variable: "--font-readex-pro",
});

// Figures only (km, µm, VIN, specs, prices in tables). Digits are Western in both locales (C-03) and
// the font has no Arabic, so Arabic unit labels sit outside it. Loads with the first figure.
export const martianMono = Martian_Mono({
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: [],
  variable: "--font-martian-mono",
});

/** Both fonts' CSS variables, for the <html> of each root layout */
export const fontVariables = `${readexPro.variable} ${martianMono.variable}`;
