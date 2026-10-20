import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Minimal config for the T-02 integration tests. T-12 owns the full test setup (BUILD-PLAN §5.1).
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // server-only throws outside the react-server condition, and these tests import server modules
      "server-only": fileURLToPath(new URL("./tests/support/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/support/load-env.ts"],
  },
});
