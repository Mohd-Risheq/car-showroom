// node tests/support/create-owner-child.ts <dealer slug> <email> <password file>: runs createOwner
// (scripts/owner-account.ts) in a process of its own, on the database on DATABASE_URL_UNPOOLED, for
// tests that limit that process, such as its file size. It prints the report, or the code of the
// error it threw, as JSON. It imports the scripts by their .ts paths, so it runs under plain Node.
import { withScriptDatabase } from "../../scripts/database.ts";
import { createOwner } from "../../scripts/owner-account.ts";

const [dealerSlug = "", email = "", passwordPath = ""] = process.argv.slice(2);
try {
  const report = await withScriptDatabase(process.env.DATABASE_URL_UNPOOLED ?? "", (database) =>
    createOwner(database, { dealerSlug, email, name: "Owner" }, passwordPath),
  );
  console.log(JSON.stringify(report));
} catch (error) {
  console.log(JSON.stringify({ failed: error instanceof Error && "code" in error ? error.code : "no code" }));
}
