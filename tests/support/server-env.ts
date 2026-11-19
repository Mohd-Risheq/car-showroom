import nextEnv from "@next/env";
import { requireEnv } from "./env.ts";

// The server's own settings, as next start reads them: .env.local here, the workflow's env in CI.
// playwright.config.ts loads them into each process that loads it, the workers among them, so the
// e2e support reads the database and the site the server uses (car-fixture.ts).

/** Loads the server's settings into this process, leaving those already set as they are */
export function loadServerEnv(): void {
  nextEnv.loadEnvConfig(process.cwd());
}

/** A setting of the server's; a missing one fails at once, naming where it comes from */
export function serverSetting(name: string): string {
  return requireEnv(name, ".env.local locally, and the workflow's env in CI");
}
