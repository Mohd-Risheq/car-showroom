import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import jsxA11y from "eslint-plugin-jsx-a11y";
import noHardcodedCopy from "./scripts/eslint/no-hardcoded-copy.mjs";
import noRawStyleValues from "./scripts/eslint/no-raw-style-values.mjs";

// SRS §11.9 and BUILD-PLAN §6.1: ESLint 9 flat config, run with --max-warnings 0
const DEV_ONLY = ["src/app/**/(dev)/**", "src/app/_dev/**"];

// The project's own rules, one plugin object for every config that names it
const muftah = { rules: { "no-hardcoded-copy": noHardcodedCopy, "no-raw-style-values": noRawStyleValues } };

// Imports no file in src makes. A config that sets no-restricted-imports replaces an earlier one's
// options, so every config that sets the rule lists these.
const RESTRICTED_IMPORTS = [
  ...["motion/react", "motion/react-client"].map((name) => ({
    name,
    importNames: ["motion"],
    message: "Use m inside LazyMotion (SRS §11.8), so Motion's features load only where something animates.",
  })),
  { name: "framer-motion", message: "Motion is imported as motion/react (SRS §11.2)." },
  {
    name: "@phosphor-icons/react",
    message: "Import icons from @phosphor-icons/react/ssr, which renders in Server and Client Components alike.",
  },
];

// Development-only code stays out of what ships
const DEV_IMPORTS = {
  group: ["@/app/_dev", "@/app/_dev/**", "**/_dev", "**/_dev/**"],
  message: "src/app/_dev is development-only: import it only from a (dev) route group.",
};

// GSAP is one lazy chunk that loads only where scrubs run (SRS §11.8): src/lib/motion/gsap.ts alone
// imports it, and only src/lib/motion/scrub.tsx loads that module, with import(). Types may be
// imported anywhere.
const GSAP_CHUNK = "src/lib/motion/gsap.ts";
const GSAP_LOADER = "src/lib/motion/scrub.tsx";
const GSAP_MESSAGE = `GSAP loads only as its lazy desktop chunk: build a scroll scrub with Scrub (${GSAP_LOADER}).`;
// GSAP's packages, and a path to the chunk, with or without its extension
const GSAP_SOURCE = "^(?:@?gsap(?:/.*)?|.*/gsap(?:\\.[cm]?[jt]sx?)?)$";
const GSAP_IMPORTS = { regex: GSAP_SOURCE, allowTypeImports: true, message: GSAP_MESSAGE };

/**
 * An import() of a source matching the pattern, as a string or as a template literal with no
 * expressions. A slash would end esquery's regex, so it is escaped.
 */
function importExpressions(source) {
  const pattern = `/${source.replaceAll("/", "\\x2F")}/`;
  return [
    { selector: `ImportExpression[source.value=${pattern}]`, message: GSAP_MESSAGE },
    {
      selector: `ImportExpression[source.quasis.length=1][source.quasis.0.value.cooked=${pattern}]`,
      message: GSAP_MESSAGE,
    },
  ];
}

// No barrel files (SRS §11.9), so tree-shaking keeps working
const BARREL_SELECTORS = [
  { selector: "ExportAllDeclaration", message: "No barrel files: import from the module itself (SRS §11.9)." },
  {
    selector: "ExportNamedDeclaration[source]",
    message: "No barrel files: import from the module itself (SRS §11.9).",
  },
];

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },
  {
    // eslint-config-next registers jsx-a11y with six of its rules. This turns on the rest of the
    // recommended set without registering the plugin a second time.
    rules: jsxA11y.flatConfigs.recommended.rules,
  },
  {
    rules: {
      // NFR-MAINT-01: zero `any`
      "@typescript-eslint/no-explicit-any": "error",
      // A variable a callback reads before its one assignment stays `let`: as a const it would throw
      "prefer-const": ["error", { ignoreReadBeforeAssign: true }],
      // Node built-ins, packages, @/ aliases, parent folders, then this folder
      "import/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", "parent", ["sibling", "index"]],
          pathGroups: [{ pattern: "@/**", group: "internal" }],
          "newlines-between": "never",
          alphabetize: { order: "asc" },
        },
      ],
    },
  },
  {
    // UI strings come from the catalogs only (SRS §11.9). Tests and the development pages are exempt.
    files: ["src/**/*.tsx"],
    ignores: DEV_ONLY,
    plugins: { muftah },
    rules: { "muftah/no-hardcoded-copy": "error" },
  },
  {
    // Colours, lengths, times and curves come from the tokens (T-13, D-038), in shipped code and the
    // development pages alike
    files: ["src/**/*.{ts,tsx}"],
    plugins: { muftah },
    rules: { "muftah/no-raw-style-values": "error" },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: DEV_ONLY,
    rules: { "no-restricted-imports": ["error", { paths: RESTRICTED_IMPORTS, patterns: [DEV_IMPORTS, GSAP_IMPORTS] }] },
  },
  {
    files: DEV_ONLY,
    rules: { "no-restricted-imports": ["error", { paths: RESTRICTED_IMPORTS, patterns: [GSAP_IMPORTS] }] },
  },
  {
    files: [GSAP_CHUNK],
    rules: { "no-restricted-imports": ["error", { paths: RESTRICTED_IMPORTS, patterns: [DEV_IMPORTS] }] },
  },
  {
    // No barrel files, and no import() of GSAP or of its chunk, which no-restricted-imports doesn't see
    files: ["src/**/*.{ts,tsx}"],
    rules: { "no-restricted-syntax": ["error", ...BARREL_SELECTORS, ...importExpressions(GSAP_SOURCE)] },
  },
  {
    // The spin engine's lazy-chunk entry re-exports it, until T-41 builds the viewer into the car page
    files: ["src/features/spin/index.ts"],
    rules: { "no-restricted-syntax": ["error", ...importExpressions(GSAP_SOURCE)] },
  },
  {
    // Scrub loads the chunk, and still not GSAP's packages themselves
    files: [GSAP_LOADER],
    rules: { "no-restricted-syntax": ["error", ...BARREL_SELECTORS, ...importExpressions("^@?gsap(?:/.*)?$")] },
  },
  {
    // Node runs the scripts and the modules they import by stripping types (tsconfig's
    // verbatimModuleSyntax and erasableSyntaxOnly). An import whose names are all types must say
    // `import type`, or Node still loads the module it names.
    rules: { "@typescript-eslint/no-import-type-side-effects": "error" },
  },
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    ".lighthouseci/**",
    ".fixtures/**",
    ".storage-local/**",
    ".dev-reports/**",
    "public/**",
  ]),
]);
