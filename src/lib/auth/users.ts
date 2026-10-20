import "server-only";
import { auth } from "./auth";
import type { UserRole } from "./roles";

type NewPasswordUser = {
  email: string;
  name: string;
  password: string;
  role: UserRole;
  mustChangePassword: boolean;
  tempPasswordExpiresAt?: Date;
};

export type CreatedUser = { id: string; email: string };

// The one way to create a password account: the user row, then its credential account.
// The account's accountId is the user's id, because the library's password update matches on it.
// The password is hashed before anything is written. The adapter has no transaction on neon-http
// (D-018), so a link that fails deletes the user again: an account without its credential could
// never sign in, and its email would block a retry.
export async function createPasswordUser(input: NewPasswordUser): Promise<CreatedUser> {
  const ctx = await auth.$context;
  const password = await ctx.password.hash(input.password);
  const user = await ctx.internalAdapter.createUser(
    {
      email: input.email,
      name: input.name,
      emailVerified: false,
      role: input.role,
      mustChangePassword: input.mustChangePassword,
      ...(input.tempPasswordExpiresAt ? { tempPasswordExpiresAt: input.tempPasswordExpiresAt } : {}),
    },
    // Only the owner or the CLI script creates accounts: there is no public sign-up (FR-29.2)
    { method: "admin" },
  );
  try {
    await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: "credential", accountId: user.id, password });
  } catch (linkError) {
    try {
      await ctx.internalAdapter.deleteUser(user.id);
    } catch (cleanupError) {
      throw new AggregateError([linkError, cleanupError], `Linking the password failed, and user ${user.id} could not be removed`);
    }
    throw linkError;
  }
  return { id: user.id, email: user.email };
}
