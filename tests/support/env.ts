// A setting the tests need. A missing one fails at once, with the variable's name and where it
// comes from, instead of somewhere later. The integration tests' come from .env.test.local
// (load-env.ts loads it) and, in CI, from the workflow's env; a setup file, and the e2e support,
// which reads the server's (server-env.ts), name their own.
const ENV_FILES = ".env.test.local locally (see .env.example), and the workflow's env in CI";

export function requireEnv(name: string, source = ENV_FILES): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} isn't set. It comes from ${source}`);
  return value;
}
