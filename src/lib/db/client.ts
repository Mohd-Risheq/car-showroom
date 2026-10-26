import "server-only";
import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle as drizzleHttp, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { drizzle as drizzlePool, type NeonDatabase } from "drizzle-orm/neon-serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

// Local Postgres runs behind Neon's local proxy on this host (BUILD-PLAN §6.3, compose.yaml).
// Any other host is a Neon database and keeps the driver defaults.
const LOCAL_PROXY_HOST = "db.localtest.me";
const LOCAL_PROXY_PORT = 4444;

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is not set (SRS §15.1)");
  return value;
}

const url = databaseUrl();

if (new URL(url).hostname === LOCAL_PROXY_HOST) {
  neonConfig.fetchEndpoint = (host) => `http://${host}:${LOCAL_PROXY_PORT}/sql`;
  neonConfig.wsProxy = (host) => `${host}:${LOCAL_PROXY_PORT}/v2`;
  neonConfig.useSecureWebSocket = false;
}

export type Database = NeonHttpDatabase<typeof schema>;

/** A database over HTTP, for single queries and batches: the app's own, or a test's throwaway one */
export function httpDatabase(databaseUrl: string): Database {
  return drizzleHttp({ client: neon(databaseUrl), schema });
}

// Single queries go over HTTP (SRS §11.4)
export const db = httpDatabase(url);

/**
 * A database for the cached public reads (SRS §11.4). Each batch runs as one read-only REPEATABLE
 * READ transaction, so its statements read one snapshot and can't write. The options reach batches
 * alone, so the public reads run in batches, of one statement too.
 */
export function publicDatabase(databaseUrl: string): Database {
  return drizzleHttp({ client: neon(databaseUrl, { isolationLevel: "RepeatableRead", readOnly: true }), schema });
}

export const publicDb = publicDatabase(url);

export type PoolTransaction = Parameters<Parameters<NeonDatabase<typeof schema>["transaction"]>[0]>[0];

/** The HTTP database or a Pool transaction: what a repository runs its queries on */
export type AnyDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

// Multi-statement writes run in one transaction on a per-request Pool, closed when it ends (SRS §11.4)
export async function withTransaction<T>(work: (tx: PoolTransaction) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: url });
  try {
    return await drizzlePool({ client: pool, schema }).transaction(work);
  } finally {
    await pool.end();
  }
}
