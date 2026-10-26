import "server-only";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { findSessionUser } from "@/lib/db/users";
import { hashPassword, verifyPassword } from "./password";
import { USER_ROLES } from "./roles";

const DAY_SECONDS = 60 * 60 * 24;
const BASE_PATH = "/api/auth";

// Sign-up, profile update, email change and password reset return 404 (API-05, FR-29.11)
const DISABLED_PATHS = [
  "/sign-up/email",
  "/update-user",
  "/change-email",
  "/request-password-reset",
  "/reset-password",
];

// Each option is confirmed against the installed library source in DECISIONS.md (API-05).
// BETTER_AUTH_SECRET and BETTER_AUTH_URL come from the environment (SRS §15.1).
// T-28 adds two-step sign-in, throttling and the rest of the API-05 hardening.
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true, // FR-29.2
    minPasswordLength: 12, // API-05; VR-30 adds the full policy
    password: { hash: hashPassword, verify: verifyPassword }, // SEC-02
  },
  session: {
    expiresIn: 7 * DAY_SECONDS, // SEC-01: 7 days, sliding
    updateAge: DAY_SECONDS,
    cookieCache: { enabled: false }, // SEC-01: a revoked session stops at the next request
    additionalFields: {
      stepUpAt: { type: "date", required: false, input: false }, // BR-41
    },
  },
  user: {
    additionalFields: {
      // The guard reads the dealer and the role from the session, so both are returned (D-043)
      dealerId: { type: "string", required: true, input: false },
      role: { type: [...USER_ROLES], required: true, defaultValue: "staff", input: false },
      mustChangePassword: { type: "boolean", required: true, defaultValue: true, input: false },
      disabledAt: { type: "date", required: false, input: false },
      tempPasswordExpiresAt: { type: "date", required: false, input: false },
      totpLastStep: { type: "number", bigint: true, required: false, input: false },
    },
  },
  basePath: BASE_PATH,
  disabledPaths: DISABLED_PATHS,
  databaseHooks: {
    session: {
      create: {
        // No IP address is stored (SEC-02), and a disabled user gets no session (ENT-User)
        before: async (session) => {
          const sessionUser = await findSessionUser(session.userId);
          if (!sessionUser || sessionUser.disabledAt) return false;
          return { data: { ipAddress: null } };
        },
      },
    },
  },
  advanced: {
    // The library leaves ids to the database, and Drizzle makes each a UUIDv7 first (SRS §6, D-043)
    database: { generateId: "uuid" },
    // The library skips its origin and CSRF checks when NODE_ENV is test; keep them on everywhere
    disableOriginCheck: false,
  },
  plugins: [nextCookies()], // must stay last
});

// The library matches disabledPaths exactly, so the reset-link route (/reset-password/:token)
// would still answer. This guard also refuses every path below a disabled one (API-05).
export function handleAuthRequest(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/{2,}/g, "/").slice(BASE_PATH.length);
  if (DISABLED_PATHS.some((disabled) => path === disabled || path.startsWith(`${disabled}/`))) {
    return Promise.resolve(new Response("Not Found", { status: 404 }));
  }
  return auth.handler(request);
}
