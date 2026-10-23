import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Two projects (SRS §16.1, BUILD-PLAN §6.1): `pnpm test` runs the unit project with the coverage
// thresholds of NFR-MAINT-02, and `pnpm test:int` the integration project against the test
// database, which alone reads .env.test.local.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // server-only throws outside the react-server condition, and the tests import server modules
      "server-only": fileURLToPath(new URL("./tests/support/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Each test starts with the real environment and globals: a vi.stubEnv or vi.stubGlobal lasts
    // until the next test starts
    unstubEnvs: true,
    unstubGlobals: true,
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.{ts,tsx}"] },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.{ts,tsx}"],
          // Integration tests always run the local store (SRS §16.1), in a temporary folder
          env: { STORAGE_DRIVER: "local" },
          setupFiles: ["./tests/support/load-env.ts", "./tests/support/storage-root.ts"],
          // A Neon branch answers slower than the local proxy (T-37)
          hookTimeout: 30_000,
          testTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      // Unit coverage counts the modules that run in Node alone, the custom checks' logic and the
      // project's lint rule. What needs a browser engine, the database or Next.js's compiler is left
      // to the integration and Playwright suites, which the comment beside each pattern names, and
      // dev-only code is left out on purpose (D-037).
      include: ["src/**/*.{ts,tsx}", "scripts/checks/**/*.ts", "scripts/eslint/**/*.mjs"],
      exclude: [
        "**/*.d.ts",
        // React components, pages and layouts among them, render in a browser or through Next.js:
        // Playwright journeys, axe and visual tests
        "src/**/*.tsx",
        // Route handlers and the layouts' metadata: integration tests and Playwright journeys
        "src/app/**/route.ts",
        "src/lib/metadata.ts",
        // Dev-only code, even where it has unit tests, so the figure is the product's: no deployment
        // serves the (dev) routes, and no code that ships imports src/app/_dev
        "src/app/_dev/**",
        "src/app/**/\\(dev\\)/**",
        // Web Workers, WebGL (cobe), Web Audio and image decoding, canvas drawing under pointer
        // input, the camera and the WebAssembly scanner: Playwright and the device checks
        "src/features/*/worker/**",
        "src/features/journey/ui/globe.ts",
        "src/features/reel/ui/prepare-clip.ts",
        "src/features/spin/ui/fetch-decode.ts",
        "src/features/spin/ui/viewer.ts",
        "src/features/vin/ui/scanner.ts",
        "src/features/vin/ui/zxing.ts",
        // Sessions and repositories need the database: pnpm test:int
        "src/lib/db/**",
        "src/lib/auth/auth.ts",
        "src/lib/auth/users.ts",
        "src/lib/storage/repository.ts",
        "src/lib/storage/upload-token.ts",
        // Runs only inside Next.js: next/font's build-time transform
        "src/styles/fonts.ts",
      ],
      reporter: ["text-summary", "json-summary", "html"],
      thresholds: {
        // NFR-MAINT-02: overall unit coverage ≥ 80% of lines, domain logic ≥ 90%
        lines: 80,
        "src/features/*/domain/**": { lines: 90 },
        "src/lib/validation/**": { lines: 90 },
      },
    },
  },
});
