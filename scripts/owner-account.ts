import { closeSync, existsSync, openSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hash } from "@node-rs/argon2";
import { and, eq } from "drizzle-orm";
import { ARGON2_OPTIONS } from "../src/lib/auth/argon2-options.ts";
import { drawTemporaryPassword } from "../src/lib/auth/temporary-password.ts";
import { account, dealer, user } from "../src/lib/db/schema.ts";
import type { OwnerInput } from "./checks/owner-input.ts";
import { Refusal, type ScriptDatabase } from "./database.ts";

// What scripts/create-owner.ts writes (SRS §6.4, D-045): a dealer's first owner, as
// createPasswordUser in src/lib/auth/users.ts writes a user, the user row and its credential
// account, here in one transaction, as the app's auth library is server-only. The password is
// BR-40's temporary one, hashed with the app's argon2id options, and the first sign-in replaces it.
// It goes to a file only its owner can read, never to the terminal, which is often logged. Nothing
// is written while the file exists, the dealer is missing or has an owner, or another account holds
// the address, so no password is ever replaced.

export type OwnerReport = { readonly refused: readonly string[] } | { readonly ownerId: string };

/** Creates the dealer's owner and writes the password to the file, or refuses and writes nothing */
export async function createOwner(
  database: ScriptDatabase,
  input: OwnerInput,
  passwordPath: string,
): Promise<OwnerReport> {
  if (existsSync(passwordPath)) {
    return { refused: [`${path.basename(passwordPath)} exists, and no password is replaced (SRS §6.4)`] };
  }
  const password = drawTemporaryPassword();
  const passwordHash = await hash(password, ARGON2_OPTIONS);
  let madeFile = false;
  try {
    const ownerId = await database.transaction(async (tx) => {
      // Locked, so two runs for the dealer can't each find it without an owner
      const [found] = await tx
        .select({ id: dealer.id })
        .from(dealer)
        .where(eq(dealer.slug, input.dealerSlug))
        .for("update");
      if (found === undefined) {
        throw new Refusal([
          `dealer ${input.dealerSlug}: not found. The seed makes the demo dealer when DEMO_MODE=true, and a client's dealer has a step of its own (D-045)`,
        ]);
      }
      const owners = await tx
        .select({ id: user.id })
        .from(user)
        .where(and(eq(user.dealerId, found.id), eq(user.role, "owner")));
      const holders = await tx.select({ id: user.id }).from(user).where(eq(user.email, input.email));
      const problems = [
        ...(owners.length > 0 ? [`dealer ${input.dealerSlug}: has an owner, whose reset is FR-29's own script`] : []),
        ...(holders.length > 0 ? ["OWNER_EMAIL: another account holds the address"] : []),
      ];
      if (problems.length > 0) throw new Refusal(problems);

      const [created] = await tx
        .insert(user)
        .values({
          name: input.name,
          email: input.email,
          emailVerified: false,
          dealerId: found.id,
          role: "owner",
          mustChangePassword: true,
        })
        .returning({ id: user.id });
      if (created === undefined) throw new Error("The owner's row wasn't returned");
      // The auth library's password update matches the credential account on the user's id
      await tx
        .insert(account)
        .values({ userId: created.id, providerId: "credential", accountId: created.id, password: passwordHash });
      // Last, so a file that can't be written rolls the rows back. "wx" never replaces a file, so
      // another run's file stays, while one this run made goes when its write or the commit fails
      const file = openSync(passwordPath, "wx", 0o600);
      madeFile = true;
      try {
        writeFileSync(file, `${password}\n`);
      } finally {
        closeSync(file);
      }
      return created.id;
    });
    return { ownerId };
  } catch (error) {
    // The rows didn't commit, so the password opens nothing
    if (madeFile) rmSync(passwordPath, { force: true });
    if (error instanceof Refusal) return { refused: error.problems };
    throw error;
  }
}
