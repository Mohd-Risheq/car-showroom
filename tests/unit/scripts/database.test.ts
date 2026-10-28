import { DrizzleQueryError } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { failureMessage } from "../../../scripts/database.ts";

// What the seed and create-owner print when their database work fails: the reason, and never the
// failed query or its values, which drizzle's own message carries

describe("failureMessage", () => {
  it("gives a failed query's reason alone", () => {
    const reason = new Error('relation "dealer" does not exist');
    const failed = new DrizzleQueryError('select "id" from "dealer" where "dealer"."slug" = $1', ["muftah"], reason);
    expect(failureMessage(failed)).toBe('relation "dealer" does not exist');
  });

  it("names neither the query nor its values when the driver gave no reason", () => {
    const failed = new DrizzleQueryError('insert into "user" ("email") values ($1)', ["owner@example.test"]);
    expect(failureMessage(failed)).toBe("A database query failed, and the driver gave no reason");
  });

  it("gives any other error's message, and what was thrown when it isn't an error", () => {
    expect(failureMessage(new Error("connect ECONNREFUSED 127.0.0.1:5432"))).toBe(
      "connect ECONNREFUSED 127.0.0.1:5432",
    );
    expect(failureMessage("closed")).toBe("closed");
  });
});
