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

// Unless told not to, Zod checks whether it may compile a parser with new Function, which a Content
// Security Policy without unsafe-eval reports (SRS §12.5). src takes z from the entry that tells it,
// so the setting is in place before any schema is built (D-043). A type import loads nothing.
const ZOD_ENTRIES = {
  regex: "^zod(?:/.*)?$",
  allowTypeImports: true,
  message: "Import z from @/lib/validation/zod, which builds every schema without new Function (D-043).",
};
const ZOD_ENTRY = "src/lib/validation/zod.ts";

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

// defineAction updates the cache once an action's transaction commits (SRS §11.9), so neither a
// handler nor a helper it calls updates it first, which would let a reader refill an entry with the
// old row. next/cache is a CommonJS module, so its default import is all of it. cacheTag and
// cacheLife, which the cached functions set, stay open.
const CACHE_UPDATES = {
  name: "next/cache",
  importNames: ["default", "updateTag", "revalidateTag", "revalidatePath", "refresh"],
  message: "defineAction updates the cache once an action's change commits (SRS §11.9): return the tags instead.",
};
const DEFINE_ACTION = "src/lib/actions/define-action.ts";
// The Server Action modules, each a "use server" file of actions built with defineAction
const ACTION_MODULES = "src/**/actions.ts";
// Each of these throws, and an action's handler runs inside its transaction, which would roll back
const NAVIGATION_ENDINGS = {
  name: "next/navigation",
  importNames: ["redirect", "permanentRedirect", "notFound", "forbidden", "unauthorized"],
  message: "This throws, which rolls the action's change back: refuse with an AppError, which defineAction returns.",
};
// A function marked "use server" is a Server Action that defineAction never guards
const INLINE_ACTION = {
  selector: ':function > BlockStatement > ExpressionStatement[directive="use server"]',
  message:
    'Export the action from an actions.ts module, built with defineAction (SRS §11.9), never an inline "use server".',
};

// Next.js's internals and its entries' .js files reach the same functions under names the bans above
// don't match. Its types may come from anywhere.
const NEXT_INTERNALS = {
  regex: "^next/(?:dist/|[^/]+\\.js$)",
  allowTypeImports: true,
  message: "Import Next.js from its public entries, which lint checks (SRS §11.9).",
};
// An import() of next/cache or next/navigation would take their functions past no-restricted-imports
const NEXT_ENDINGS_IMPORT = [
  ...importExpressions(
    "^next/(?:cache|navigation)$",
    "Import next/cache and next/navigation statically, where ESLint sees the names a file takes (SRS §11.9).",
  ),
  ...importExpressions(NEXT_INTERNALS.regex, NEXT_INTERNALS.message),
];

// An import() of Zod would take z past no-restricted-imports, without the entry's setting (D-043).
// The entry imports Zod statically, so src has no import() of it at all.
const ZOD_IMPORT = importExpressions(ZOD_ENTRIES.regex, ZOD_ENTRIES.message);

// What every config that sets no-restricted-syntax for src refuses, beside its own selectors
const SRC_SYNTAX = [
  ...importExpressions(GSAP_SOURCE, GSAP_MESSAGE),
  ...importExpressions(NEXT_INTL_SOURCE, NEXT_INTL_IMPORT_MESSAGE),
  ...NEXT_ENDINGS_IMPORT,
  ...ZOD_IMPORT,
  INLINE_ACTION,
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
          paths: [...RESTRICTED_IMPORTS, ...NEXT_INTL_LOCALE, ...NEXT_INTL_FORMATTER, HAS_LOCALE, CACHE_UPDATES],
          patterns: [DEV_IMPORTS, GSAP_IMPORTS, PHOSPHOR_ENTRIES, ZOD_ENTRIES, NEXT_INTERNALS],
        },
      ],
    },
  },
  {
    // The entry itself, which loads Zod and sets it up
    files: [ZOD_ENTRY],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...RESTRICTED_IMPORTS, ...NEXT_INTL_LOCALE, ...NEXT_INTL_FORMATTER, HAS_LOCALE, CACHE_UPDATES],
          patterns: [DEV_IMPORTS, GSAP_IMPORTS, PHOSPHOR_ENTRIES, NEXT_INTERNALS],
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
          paths: [...RESTRICTED_IMPORTS, ...NEXT_INTL_LOCALE, ...NEXT_INTL_FORMATTER, CACHE_UPDATES],
          patterns: [DEV_IMPORTS, GSAP_IMPORTS, PHOSPHOR_ENTRIES, ZOD_ENTRIES, NEXT_INTERNALS],
        },
      ],
    },
  },
  {
    files: DEV_ONLY,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...RESTRICTED_IMPORTS, ...NEXT_INTL_LOCALE, HAS_LOCALE, CACHE_UPDATES],
          patterns: [GSAP_IMPORTS, PHOSPHOR_ENTRIES, ZOD_ENTRIES, NEXT_INTERNALS],
        },
      ],
    },
  },
  {
    files: [GSAP_CHUNK],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...RESTRICTED_IMPORTS, ...NEXT_INTL_LOCALE, ...NEXT_INTL_FORMATTER, HAS_LOCALE, CACHE_UPDATES],
          patterns: [DEV_IMPORTS, PHOSPHOR_ENTRIES, ZOD_ENTRIES, NEXT_INTERNALS],
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
          paths: [...RESTRICTED_IMPORTS, ...NEXT_INTL_FORMATTER, HAS_LOCALE, CACHE_UPDATES],
          patterns: [DEV_IMPORTS, GSAP_IMPORTS, PHOSPHOR_ENTRIES, ZOD_ENTRIES, NEXT_INTERNALS],
        },
      ],
    },
  },
  {
    // defineAction, which updates the cache once an action's change commits
    files: [DEFINE_ACTION],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...RESTRICTED_IMPORTS, ...NEXT_INTL_LOCALE, ...NEXT_INTL_FORMATTER, HAS_LOCALE],
          patterns: [DEV_IMPORTS, GSAP_IMPORTS, PHOSPHOR_ENTRIES, ZOD_ENTRIES, NEXT_INTERNALS],
        },
      ],
    },
  },
  {
    // The action modules, whose handlers run inside their transaction
    files: [ACTION_MODULES],
    ignores: DEV_ONLY,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...RESTRICTED_IMPORTS,
            ...NEXT_INTL_LOCALE,
            ...NEXT_INTL_FORMATTER,
            HAS_LOCALE,
            CACHE_UPDATES,
            NAVIGATION_ENDINGS,
          ],
          patterns: [DEV_IMPORTS, GSAP_IMPORTS, PHOSPHOR_ENTRIES, ZOD_ENTRIES, NEXT_INTERNALS],
        },
      ],
    },
  },
  {
    // No barrel files, no import() of GSAP, of its chunk, of next-intl, of next/cache or
    // next/navigation, which no-restricted-imports doesn't see, and no number or date written outside
    // src/lib/format. A config that sets no-restricted-syntax replaces an earlier one's options, so
    // every config that sets the rule lists next-intl's and the formatters.
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
        ...NEXT_ENDINGS_IMPORT,
        ...ZOD_IMPORT,
        INLINE_ACTION,
        ...FORMATTING_SELECTORS,
      ],
    },
  },
  {
    // Server logs go through src/lib/log, one JSON line each with the request ID (NFR-OBS-01,
    // SRS §13.4). The development pages are tools.
    files: ["src/**/*.{ts,tsx}"],
    ignores: [...DEV_ONLY, "src/lib/log/**"],
    rules: { "no-console": "error" },
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
