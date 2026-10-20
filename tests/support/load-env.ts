import { loadEnvConfig } from "@next/env";

// Loads .env.test.local the way Next.js does for NODE_ENV=test; variables already set win,
// so the same tests run against a Neon branch at gate 3 (T-37). Under any other NODE_ENV,
// @next/env loads .env.local instead, and the integration tests would write to the
// development database, so the run stops first.
if (process.env.NODE_ENV !== "test") {
  throw new Error(`Run the tests with NODE_ENV=test, not ${process.env.NODE_ENV}: otherwise .env.local is loaded`);
}
loadEnvConfig(process.cwd());
