import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth/auth";
import { createPasswordUser } from "@/lib/auth/users";
import { db } from "@/lib/db/client";
import { account, session, user } from "@/lib/db/schema";
import {
  authOrigin,
  authRequest,
  cookiePair,
  createTestUser,
  deleteTestUsers,
  sessionSetCookie,
  signIn,
  TEST_USER_AGENT,
  type TestUser,
} from "../support/auth";

// Sign-in round trip through the API-05 route handler with database sessions (FR-29, SEC-01,
// SEC-02). Runs unchanged on the local proxy (BUILD-PLAN §6.3) and on a Neon branch (T-37).

const run = crypto.randomUUID();
const unlinkedEmail = `t02-unlinked-${run}@example.test`;
const unhashedEmail = `t02-unhashed-${run}@example.test`;

type SessionBody = { user: { id: string; email: string; role: string } } | null;
type ErrorBody = { code?: string };

const sessionsOf = (userId: string) => db.select().from(session).where(eq(session.userId, userId));
const usersWith = (email: string) => db.select({ id: user.id }).from(user).where(eq(user.email, email));

let active: TestUser;
let disabled: TestUser;

beforeAll(async () => {
  active = await createTestUser("staff");
  disabled = await createTestUser("staff");
  await db.update(user).set({ disabledAt: new Date() }).where(eq(user.id, disabled.id));
});

// Each test starts signed out, whatever the one before it left
afterEach(async () => {
  await db.delete(session).where(inArray(session.userId, [active.id, disabled.id]));
});

// The createPasswordUser cases below must leave no user behind; deleting by email clears one
// they left, so a failure there doesn't carry over to the next run
afterAll(async () => {
  await deleteTestUsers();
  await db.delete(user).where(inArray(user.email, [unlinkedEmail, unhashedEmail]));
});

describe("createPasswordUser", () => {
  const input = {
    name: "T-02 partial",
    password: `t02-password-${run}`,
    role: "staff",
    mustChangePassword: false,
  } as const;

  it("removes the user again when its password can't be linked", async () => {
    const { internalAdapter } = await auth.$context;
    const link = vi.spyOn(internalAdapter, "linkAccount").mockRejectedValueOnce(new Error("link failed"));
    await expect(createPasswordUser({ ...input, email: unlinkedEmail })).rejects.toThrow("link failed");
    link.mockRestore();
    expect(await usersWith(unlinkedEmail)).toEqual([]);
  });

  it("writes nothing when the password can't be hashed", async () => {
    const { password: hasher } = await auth.$context;
    const hash = vi.spyOn(hasher, "hash").mockRejectedValueOnce(new Error("hash failed"));
    await expect(createPasswordUser({ ...input, email: unhashedEmail })).rejects.toThrow("hash failed");
    hash.mockRestore();
    expect(await usersWith(unhashedEmail)).toEqual([]);
  });
});

describe("sign-in round trip", () => {
  it("stores the password as argon2id at the OWASP minimum, on the credential account", async () => {
    const [row] = await db
      .select({ password: account.password, accountId: account.accountId, providerId: account.providerId })
      .from(account)
      .where(eq(account.userId, active.id));
    expect(row?.password).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(row?.providerId).toBe("credential");
    expect(row?.accountId).toBe(active.id);
  });

  it("signs in, reads the session from the database, and signs out server-side", async () => {
    const response = await authRequest("POST", "/sign-in/email", {
      body: { email: active.email, password: active.password },
    });
    expect(response.status).toBe(200);
    const setCookie = sessionSetCookie(response);
    expect(setCookie).toMatch(/;\s*HttpOnly/i);
    expect(setCookie).toMatch(/;\s*SameSite=Lax/i);
    expect(setCookie).toMatch(/;\s*Path=\//i);
    const cookie = cookiePair(setCookie);

    const [stored, ...others] = await sessionsOf(active.id);
    expect(others).toEqual([]);
    expect(stored?.ipAddress).toBeNull();
    expect(stored?.userAgent).toBe(TEST_USER_AGENT);

    const current = await authRequest("GET", "/get-session", { cookie });
    expect(current.status).toBe(200);
    const body = (await current.json()) as SessionBody;
    expect(body?.user).toMatchObject({ id: active.id, email: active.email, role: "staff" });

    const signOut = await authRequest("POST", "/sign-out", { cookie, body: {} });
    expect(signOut.status).toBe(200);
    expect(await sessionsOf(active.id)).toEqual([]);

    const afterSignOut = await authRequest("GET", "/get-session", { cookie });
    expect((await afterSignOut.json()) as SessionBody).toBeNull();
  });

  it("refuses a wrong password and creates no session", async () => {
    const response = await authRequest("POST", "/sign-in/email", {
      body: { email: active.email, password: `${active.password}-wrong` },
    });
    expect(response.status).toBe(401);
    expect(((await response.json()) as ErrorBody).code).toBe("INVALID_EMAIL_OR_PASSWORD");
    expect(await sessionsOf(active.id)).toEqual([]);
  });

  it("gives a disabled user no session", async () => {
    const response = await authRequest("POST", "/sign-in/email", {
      body: { email: disabled.email, password: disabled.password },
    });
    expect(response.status).toBe(401);
    expect(((await response.json()) as ErrorBody).code).toBe("FAILED_TO_CREATE_SESSION");
    expect(await sessionsOf(disabled.id)).toEqual([]);
  });

  it("refuses a request from another origin that carries the session cookie", async () => {
    const cookie = await signIn(active);
    const forged = await authRequest("POST", "/sign-out", { cookie, body: {}, origin: "https://attacker.example" });
    expect(forged.status).toBe(403);
    expect(await sessionsOf(active.id)).toHaveLength(1);

    const signOut = await authRequest("POST", "/sign-out", { cookie, body: {} });
    expect(signOut.status).toBe(200);
    expect(await sessionsOf(active.id)).toEqual([]);
  });
});

describe("disabled auth routes (API-05, FR-29.11)", () => {
  it.each([
    ["POST", "/sign-up/email"],
    ["POST", "/update-user"],
    ["POST", "/change-email"],
    ["POST", "/request-password-reset"],
    ["POST", "/reset-password"],
    ["GET", "/reset-password/a-token?callbackURL=%2F"],
    ["POST", "/update-user/"],
    ["POST", "//update-user"],
    ["POST", "/update%2Duser"],
    ["GET", "/reset%2Dpassword/a-token?callbackURL=%2F"],
    ["POST", "/Update-User"],
  ] as const)("%s %s returns 404", async (method, path) => {
    const response = await authRequest(method, path, method === "POST" ? { body: {} } : {});
    expect(response.status).toBe(404);
  });

  // The guard in front of the handler covers sub-paths; the library's own disabledPaths covers these
  it.each(["/sign-up/email", "/update-user", "/change-email", "/request-password-reset", "/reset-password"])(
    "the library itself refuses POST %s",
    async (path) => {
      const response = await auth.handler(
        new Request(`${authOrigin}/api/auth${path}`, {
          method: "POST",
          headers: { origin: authOrigin, "content-type": "application/json" },
          body: "{}",
        }),
      );
      expect(response.status).toBe(404);
    },
  );
});
