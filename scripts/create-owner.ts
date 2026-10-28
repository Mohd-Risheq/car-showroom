// node scripts/create-owner.ts (SRS §6.4, D-045): creates the first owner of the dealer DEALER_SLUG
// names, from OWNER_EMAIL and OWNER_NAME, on the database on DATABASE_URL_UNPOOLED. The password goes
// to the git-ignored file .owner-password, mode 0600, and the script prints that path alone. It
// refuses, and writes nothing, while the file exists, the dealer is missing or has an owner, or
// another account holds the address.
import path from "node:path";
import nextEnv from "@next/env";
import { ROOT } from "./checks/files.ts";
import { ownerInput } from "./checks/owner-input.ts";
import { failureMessage, withScriptDatabase } from "./database.ts";
import { createOwner } from "./owner-account.ts";

nextEnv.loadEnvConfig(ROOT);

const PASSWORD_FILE = ".owner-password";

function refuse(problems: readonly string[]): void {
  for (const problem of problems) console.error(`create-owner: ${problem}`);
  console.error("create-owner: nothing written");
  process.exitCode = 1;
}

const read = ownerInput(process.env);
const url = process.env.DATABASE_URL_UNPOOLED;

if ("problems" in read) {
  refuse(read.problems);
} else if (!url) {
  refuse(["DATABASE_URL_UNPOOLED isn't set (SRS §15.1)"]);
} else {
  try {
    const report = await withScriptDatabase(url, (database) =>
      createOwner(database, read.input, path.join(ROOT, PASSWORD_FILE)),
    );
    if ("refused" in report) {
      refuse(report.refused);
    } else {
      console.log(
        `create-owner: the owner's password is in ${PASSWORD_FILE}, mode 0600. Sign in, change it, set up two-step sign-in, then delete the file`,
      );
    }
  } catch (error) {
    // The reason alone: never the failed query, its values or the URL
    console.error(`create-owner: ${failureMessage(error)}`);
    process.exitCode = 1;
  }
}
