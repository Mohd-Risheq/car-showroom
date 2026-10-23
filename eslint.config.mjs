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

// next-intl's own locale is the formatting locale, such as ar-JO-u-nu-latn (D-040), and its
// navigation helpers build links with it. The URL's locale, ar or en, comes from getAppLocale,
// which src/lib/i18n/server.ts alone builds on next-intl's.
const APP_LOCALE_MESSAGE = "next-intl's locale is the formatting locale (D-040)";
const NEXT_INTL_LOCALE = [
  {
    name: "next-intl/server",
    importNames: ["getLocale"],
    message: `${APP_LOCALE_MESSAGE}: read the URL's with getAppLocale from @/lib/i18n/server.`,
  },
  {
    name: "next-intl",
    importNames: ["useLocale"],
    message: `${APP_LOCALE_MESSAGE}: pass a Client Component the URL's from getAppLocale.`,
  },
  {
    name: "next-intl/navigation",
    message: `${APP_LOCALE_MESSAGE}, and its links carry it: link with next/link and the URL's locale.`,
  },
];
const APP_LOCALE_READER = "src/lib/i18n/server.ts";
// An import() of next-intl would take its locale past no-restricted-imports
const NEXT_INTL_SOURCE = "^next-intl(?:/.*)?$";
const NEXT_INTL_IMPORT_MESSAGE = `${APP_LOCALE_MESSAGE}: import next-intl statically, where ESLint sees the names a file takes.`;

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
 * expressions, refused with the message. A slash would end esquery's regex, so it is escaped.
 */
function importExpressions(source, message) {
  const pattern = `/${source.replaceAll("/", "\\x2F")}/`;
  return [
    { selector: `ImportExpression[source.value=${pattern}]`, message },
    { selector: `ImportExpression[source.quasis.length=1][source.quasis.0.value.cooked=${pattern}]`, message },
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
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [...RESTRICTED_IMPORTS, ...NEXT_INTL_LOCALE], patterns: [DEV_IMPORTS, GSAP_IMPORTS] },
      ],
    },
  },
  {
    files: DEV_ONLY,
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [...RESTRICTED_IMPORTS, ...NEXT_INTL_LOCALE], patterns: [GSAP_IMPORTS] },
      ],
    },
  },
  {
    files: [GSAP_CHUNK],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [...RESTRICTED_IMPORTS, ...NEXT_INTL_LOCALE], patterns: [DEV_IMPORTS] },
      ],
    },
  },
  {
    files: [APP_LOCALE_READER],
    rules: { "no-restricted-imports": ["error", { paths: RESTRICTED_IMPORTS, patterns: [DEV_IMPORTS, GSAP_IMPORTS] }] },
  },
  {
    // No barrel files, and no import() of GSAP, of its chunk or of next-intl, which
    // no-restricted-imports doesn't see. A config that sets no-restricted-syntax replaces an earlier
    // one's options, so every config that sets the rule lists next-intl's.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...BARREL_SELECTORS,
        ...importExpressions(GSAP_SOURCE, GSAP_MESSAGE),
        ...importExpressions(NEXT_INTL_SOURCE, NEXT_INTL_IMPORT_MESSAGE),
      ],
    },
  },
  {
    // The spin engine's lazy-chunk entry re-exports it, until T-41 builds the viewer into the car page
    files: ["src/features/spin/index.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...importExpressions(GSAP_SOURCE, GSAP_MESSAGE),
        ...importExpressions(NEXT_INTL_SOURCE, NEXT_INTL_IMPORT_MESSAGE),
      ],
    },
  },
  {
    // Scrub loads the chunk, and still not GSAP's packages themselves
    files: [GSAP_LOADER],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...BARREL_SELECTORS,
        ...importExpressions("^@?gsap(?:/.*)?$", GSAP_MESSAGE),
        ...importExpressions(NEXT_INTL_SOURCE, NEXT_INTL_IMPORT_MESSAGE),
      ],
    },
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
