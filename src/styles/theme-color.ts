// The browser's theme colour, each workspace theme's --bg (DESIGN §3.2): the root layouts' viewport
// gives it before any script runs. tests/unit/theme-color.test.ts fails when tokens.css differs.
export const THEME_COLOR = {
  /** The public site, and the workspace's dark theme */
  dark: "#0b0d10",
  /** Daylight, the workspace's default */
  daylight: "#f3f5f7",
} as const;
