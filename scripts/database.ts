import { DrizzleQueryError } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/lib/db/schema.ts";
import { errorMessage } from "./checks/files.ts";

// The scripts' database: postgres-js on the direct URL, as pnpm db:migrate connects (SRS §11.4). The
// app's client is server-only, and its HTTP driver has no transactions, which the seed and
// create-owner each write in.

export type ScriptDatabase = PostgresJsDatabase<typeof schema>;
export type ScriptTransaction = Parameters<Parameters<ScriptDatabase["transaction"]>[0]>[0];

/** Runs the work on a database opened on the URL, and closes it after */
export async function withScriptDatabase<Result>(
  url: string,
  work: (database: ScriptDatabase) => Promise<Result>,
): Promise<Result> {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    return await work(drizzle({ client, schema }));
  } finally {
    await client.end();
  }
}

/**
 * What a script prints when its database work fails: a failed query's reason, as the driver gave it,
 * since drizzle's own message is the query and its values, and any other error's message alone, as
 * an error's other fields can carry the URL
 */
export function failureMessage(error: unknown): string {
  if (!(error instanceof DrizzleQueryError)) return errorMessage(error);
  return error.cause === undefined
    ? "A database query failed, and the driver gave no reason"
    : errorMessage(error.cause);
}

/** Why a script wrote nothing: thrown inside its transaction to roll it back, and returned as its outcome */
export class Refusal extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(problems.join("; "));
    this.name = "Refusal";
    this.problems = problems;
  }
}
