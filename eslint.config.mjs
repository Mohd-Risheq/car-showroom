import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import jsxA11y from "eslint-plugin-jsx-a11y";
import noHardcodedCopy from "./scripts/eslint/no-hardcoded-copy.mjs";

// SRS §11.9 and BUILD-PLAN §6.1: ESLint 9 flat config, run with --max-warnings 0
const DEV_ONLY = ["src/app/**/(dev)/**", "src/app/_dev/**"];

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
    plugins: { muftah: { rules: { "no-hardcoded-copy": noHardcodedCopy } } },
    rules: { "muftah/no-hardcoded-copy": "error" },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: DEV_ONLY,
    rules: {
      // Development-only code stays out of what ships
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/_dev", "@/app/_dev/**", "**/_dev", "**/_dev/**"],
              message: "src/app/_dev is development-only: import it only from a (dev) route group.",
            },
          ],
        },
      ],
    },
  },
  {
    // No barrel files (SRS §11.9), so tree-shaking keeps working
    files: ["src/**/*.{ts,tsx}"],
    // The spin engine's lazy-chunk entry, until T-41 builds the viewer into the car page
    ignores: ["src/features/spin/index.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "ExportAllDeclaration", message: "No barrel files: import from the module itself (SRS §11.9)." },
        {
          selector: "ExportNamedDeclaration[source]",
          message: "No barrel files: import from the module itself (SRS §11.9).",
        },
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
