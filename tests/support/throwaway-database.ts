import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { requireEnv } from "./env";

// A database made for one test file, migrated the way pnpm db:migrate migrates (postgres-js over the
// direct URL), and dropped after it. A file runs in one when other files' rows could disturb its
// results, or its writes theirs: a purge, a benchmark.

export type ThrowawayDatabase = {
  /** For postgres-js, as pnpm db:migrate connects */
  readonly directUrl: string;
  /** For the app's own driver, through the local proxy or Neon's pooler */
  readonly url: string;
  readonly drop: () => Promise<void>;
};

const LABEL = /^[a-z][a-z0-9_]{0,40}$/;

function withDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.href;
}

/** A new, migrated database named after the label and a random suffix */
export async function createThrowawayDatabase(label: string): Promise<ThrowawayDatabase> {
  if (!LABEL.test(label)) throw new RangeError(`Not a database label: ${label}`);
  const name = `${label}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const admin = postgres(requireEnv("DATABASE_URL_UNPOOLED"), { max: 1, onnotice: () => {} });
  const drop = async () => {
    try {
      await admin.unsafe(`drop database if exists "${name}" with (force)`);
    } finally {
      await admin.end();
    }
  };

  const directUrl = withDatabase(requireEnv("DATABASE_URL_UNPOOLED"), name);
  try {
    await admin.unsafe(`create database "${name}"`);
    const client = postgres(directUrl, { max: 1, onnotice: () => {} });
    try {
      await migrate(drizzle({ client }), { migrationsFolder: "drizzle" });
    } finally {
      await client.end();
    }
  } catch (error) {
    await drop();
    throw error;
  }
  return { directUrl, url: withDatabase(requireEnv("DATABASE_URL"), name), drop };
}
