// A setting the integration tests need. A missing one stops the file at once, with the variable's
// name and where it comes from, instead of failing somewhere later. Most come from .env.test.local
// (load-env.ts loads it) and, in CI, from the workflow's env; a setup file names its own.
const ENV_FILES = ".env.test.local locally (see .env.example), and the workflow's env in CI";

export function requireEnv(name: string, source = ENV_FILES): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} isn't set. It comes from ${source}`);
  return value;
}
