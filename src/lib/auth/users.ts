import "server-only";
import { auth } from "./auth";

type NewPasswordUser = {
  email: string;
  name: string;
  password: string;
  role: "owner" | "staff";
  mustChangePassword: boolean;
  tempPasswordExpiresAt?: Date;
};

// The one way to create a password account: the user row, then its credential account.
// The account's accountId is the user's id, because the library's password update matches on it.
export async function createPasswordUser(input: NewPasswordUser) {
  const ctx = await auth.$context;
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
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(input.password),
  });
  return user;
}
