import { loadEnvConfig } from "@next/env";

// Loads .env.test.local the way Next.js does for NODE_ENV=test; variables already set win,
// so the same tests run against a Neon branch at gate 3 (T-37).
loadEnvConfig(process.cwd());
