import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./client";
import { user } from "./schema";

// The user rows the auth library's hooks read (SRS §11.9: data access goes through lib/db)

export type SessionUser = { disabledAt: Date | null };

/** What a new session needs to know of its user, or undefined when the user is gone */
export async function findSessionUser(userId: string): Promise<SessionUser | undefined> {
  const [row] = await db.select({ disabledAt: user.disabledAt }).from(user).where(eq(user.id, userId)).limit(1);
  return row;
}
