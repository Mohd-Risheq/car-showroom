import { inArray } from "drizzle-orm";
import { GET, POST } from "@/app/api/auth/[...all]/route";
import type { UserRole } from "@/lib/auth/roles";
import { createPasswordUser } from "@/lib/auth/users";
import { db } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { requireEnv } from "./env";

// Users and sessions for the integration tests, made the way production makes them: through
// createPasswordUser and the API-05 route handler.

export const authOrigin = new URL(requireEnv("BETTER_AUTH_URL")).origin;
export const TEST_USER_AGENT = "Muftah-test/1.0";

export type TestUser = { id: string; email: string; password: string };

const createdIds = new Set<string>();

/** A password user with an email and a password of its own. deleteTestUsers removes it. */
export async function createTestUser(role: UserRole, { mustChangePassword = false } = {}): Promise<TestUser> {
  const email = `test-${role}-${crypto.randomUUID()}@example.test`;
  const password = `test-password-${crypto.randomUUID()}`;
  const { id } = await createPasswordUser({ email, name: `Test ${role}`, password, role, mustChangePassword });
  createdIds.add(id);
  return { id, email, password };
}

/** Deletes every user createTestUser made. Their sessions and accounts cascade. */
export async function deleteTestUsers(): Promise<void> {
  if (createdIds.size === 0) return;
  await db.delete(user).where(inArray(user.id, [...createdIds]));
  createdIds.clear();
}

/** The Set-Cookie header that carries the session token */
export function sessionSetCookie(response: Response): string {
  const setCookie = response.headers.getSetCookie().find((value) => value.includes("session_token="));
  if (!setCookie) throw new Error("the response set no session cookie");
  return setCookie;
}

/**
 * A request to the route handler at /api/auth + path, sent the way a browser behind the proxy sends
 * it: from the auth origin unless another is given, with the test user agent and a forwarded client
 * address, so a test can show the address isn't stored (SEC-02)
 */
export function authRequest(
  method: "GET" | "POST",
  path: string,
  init: { body?: unknown; cookie?: string; origin?: string } = {},
): Promise<Response> {
  const headers = new Headers({
    origin: init.origin ?? authOrigin,
    "user-agent": TEST_USER_AGENT,
    "x-forwarded-for": "203.0.113.7",
  });
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  const request = new Request(`${authOrigin}/api/auth${path}`, {
    method,
    headers,
    body: init.body === undefined ? null : JSON.stringify(init.body),
  });
  return method === "GET" ? GET(request) : POST(request);
}

/** A Set-Cookie header's name=value, the form a Cookie header sends it back in */
export function cookiePair(setCookie: string): string {
  return setCookie.split(";")[0] ?? "";
}

/** Signs in through the route handler and returns the session cookie as name=value */
export async function signIn({ email, password }: Pick<TestUser, "email" | "password">): Promise<string> {
  const response = await authRequest("POST", "/sign-in/email", { body: { email, password } });
  if (response.status !== 200) throw new Error(`sign-in answered ${response.status}`);
  return cookiePair(sessionSetCookie(response));
}
