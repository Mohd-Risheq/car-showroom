import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import jsxA11y from "eslint-plugin-jsx-a11y";
import logicalProperties from "./scripts/eslint/logical-properties.mjs";
import mirrorDirectionalIcons from "./scripts/eslint/mirror-directional-icons.mjs";
import noHardcodedCopy from "./scripts/eslint/no-hardcoded-copy.mjs";
import noRawStyleValues from "./scripts/eslint/no-raw-style-values.mjs";

// SRS §11.9 and BUILD-PLAN §6.1: ESLint 9 flat config, run with --max-warnings 0
const DEV_ONLY = ["src/app/**/(dev)/**", "src/app/_dev/**"];

// The project's own rules, one plugin object for every config that names it
const muftah = {
  rules: {
    "logical-properties": logicalProperties,
    "mirror-directional-icons": mirrorDirectionalIcons,
    "no-hardcoded-copy": noHardcodedCopy,
    "no-raw-style-values": noRawStyleValues,
  },
};

const PHOSPHOR_MESSAGE =
  "Import icons from @phosphor-icons/react/ssr, which renders in Server and Client Components alike.";
// Imports no file in src makes. A config that sets no-restricted-imports replaces an earlier one's
// options, so every config that sets the rule lists these.
const RESTRICTED_IMPORTS = [
  ...["motion/react", "motion/react-client"].map((name) => ({
    name,
    importNames: ["motion"],
    message: "Use m inside LazyMotion (SRS §11.8), so Motion's features load only where something animates.",
  })),
  { name: "framer-motion", message: "Motion is imported as motion/react (SRS §11.2)." },
  { name: "@phosphor-icons/react", message: PHOSPHOR_MESSAGE },
];
// Phosphor's other entries, such as /dist/ssr or one icon's module, so every icon comes from /ssr.
// muftah/mirror-directional-icons reads them all, so this ban isn't what keeps an arrow mirrored.
const PHOSPHOR_ENTRIES = { regex: "^@phosphor-icons/react/(?!ssr$)", message: PHOSPHOR_MESSAGE };

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
// next-intl's hasLocale brings its message formatter into a browser bundle (D-041). The request
// config, which runs on the server, keeps it, as SRS §11.5 rule 8 has it.
const HAS_LOCALE = {
  name: "next-intl",
  importNames: ["hasLocale"],
  message: "Check a locale with isAppLocale from @/lib/i18n/locales, which brings none of next-intl along (D-041).",
};
const REQUEST_CONFIG = "src/lib/i18n/request.ts";
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

// Numbers and dates are written by src/lib/format alone (BR-02, BR-03), which writes them alike on
// the server and in every browser, so a page hydrates. Intl's formatters, toLocaleString and
// next-intl's formatter each write them their own way: direction marks around an Arabic sign, a
// comma after an Arabic month in WebKit (D-040, D-041).
const FORMAT_MESSAGE =
  "Write numbers and dates with src/lib/format (BR-02, BR-03), alike on the server and in every browser.";
const FORMAT_DIRECTORY = "src/lib/format/**";
const INTL_FORMATTERS = "/^(?:NumberFormat|DateTimeFormat|RelativeTimeFormat|ListFormat|DurationFormat|DisplayNames)$/";
const FORMATTING_SELECTORS = [
  { selector: "CallExpression[callee.property.name=/^toLocale(?:Date|Time)?String$/]", message: FORMAT_MESSAGE },
  {
    selector: `:matches(NewExpression, CallExpression)[callee.object.name="Intl"][callee.property.name=${INTL_FORMATTERS}]`,
    message: FORMAT_MESSAGE,
  },
];
const NEXT_INTL_FORMATTER = [
  { name: "next-intl/server", importNames: ["getFormatter"], message: FORMAT_MESSAGE },
  { name: "next-intl", importNames: ["useFormatter", "createFormatter"], message: FORMAT_MESSAGE },
];

// What every config that sets no-restricted-syntax for src refuses, beside its own selectors
const SRC_SYNTAX = [
  ...importExpressions(GSAP_SOURCE, GSAP_MESSAGE),
  ...importExpressions(NEXT_INTL_SOURCE, NEXT_INTL_IMPORT_MESSAGE),
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
    // Layout takes logical properties, and arrows along the line mirror, so a page mirrors between
    // Arabic and English (DESIGN §3.4, FR-01.7). The development pages are tools, some fixed left to
    // right, and are exempt.
    files: ["src/**/*.{ts,tsx}"],
    ignores: DEV_ONLY,
    plugins: { muftah },
    rules: { "muftah/logical-properties": "error", "muftah/mirror-directional-icons": "error" },
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
        {
          paths: [...RESTRICTED_IMPORTS, ...NEXT_INTL_LOCALE, ...NEXT_INTL_FORMATTER, HAS_LOCALE],
          patterns: [DEV_IMPORTS, GSAP_IMPORTS, PHOSPHOR_ENTRIES],
        },
      ],
    },
  },
  {
    files: [REQUEST_CONFIG],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...RESTRICTED_IMPORTS, ...NEXT_INTL_LOCALE, ...NEXT_INTL_FORMATTER],
          patterns: [DEV_IMPORTS, GSAP_IMPORTS, PHOSPHOR_ENTRIES],
        },
      ],
    },
  },
  {
    files: DEV_ONLY,
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [...RESTRICTED_IMPORTS, ...NEXT_INTL_LOCALE, HAS_LOCALE], patterns: [GSAP_IMPORTS, PHOSPHOR_ENTRIES] },
      ],
    },
  },
  {
    files: [GSAP_CHUNK],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...RESTRICTED_IMPORTS, ...NEXT_INTL_LOCALE, ...NEXT_INTL_FORMATTER, HAS_LOCALE],
          patterns: [DEV_IMPORTS, PHOSPHOR_ENTRIES],
        },
      ],
    },
  },
  {
    files: [APP_LOCALE_READER],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...RESTRICTED_IMPORTS, ...NEXT_INTL_FORMATTER, HAS_LOCALE],
          patterns: [DEV_IMPORTS, GSAP_IMPORTS, PHOSPHOR_ENTRIES],
        },
      ],
    },
  },
  {
    // No barrel files, no import() of GSAP, of its chunk or of next-intl, which no-restricted-imports
    // doesn't see, and no number or date written outside src/lib/format. A config that sets
    // no-restricted-syntax replaces an earlier one's options, so every config that sets the rule
    // lists next-intl's and the formatters.
    files: ["src/**/*.{ts,tsx}"],
    rules: { "no-restricted-syntax": ["error", ...BARREL_SELECTORS, ...SRC_SYNTAX, ...FORMATTING_SELECTORS] },
  },
  {
    // src/lib/format writes numbers and dates; the development pages are tools, and some measure Intl
    files: [FORMAT_DIRECTORY, ...DEV_ONLY],
    rules: { "no-restricted-syntax": ["error", ...BARREL_SELECTORS, ...SRC_SYNTAX] },
  },
  {
    // The spin engine's lazy-chunk entry re-exports it, until T-41 builds the viewer into the car page
    files: ["src/features/spin/index.ts"],
    rules: { "no-restricted-syntax": ["error", ...SRC_SYNTAX, ...FORMATTING_SELECTORS] },
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
        ...FORMATTING_SELECTORS,
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
