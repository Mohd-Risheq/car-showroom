import "server-only";
import type { DealerContext } from "@/lib/db/scoped-repo";
import { AppError } from "@/lib/errors/app-error";
import { auth } from "./auth";
import { isUserRole } from "./roles";

/** A dealer's session: the context its queries are scoped to, and when it last stepped up (BR-41) */
export type DealerSession = { readonly ctx: DealerContext; readonly stepUpAt: Date | null };

// FR-29.6's guard, which every dealer action and handler runs: a session (SEC-03), a user who isn't
// disabled and has finished onboarding (BR-40), and a dealer role (§4.2). Disabling a user revokes
// their sessions (BR-41), so the disabled check is the fallback. No session answers 401; a disabled
// user, one who must still change their password, and a role that isn't a dealer's answer 403, as
// FR-29.6 allows either. T-28 adds onboarding's two-step setup, and the password change and two-step
// setup that onboarding still allows; T-29 adds the demo session's context.
export async function requireDealerSession(headers: Headers): Promise<DealerSession> {
  const found = await auth.api.getSession({ headers });
  if (!found) throw new AppError("UNAUTHENTICATED", "no session");
  const { user, session } = found;
  if (user.disabledAt || user.mustChangePassword) throw new AppError("FORBIDDEN", "account guard");
  if (!isUserRole(user.role)) throw new AppError("FORBIDDEN", "role");
  return {
    ctx: { role: user.role, dealerId: user.dealerId, userId: user.id },
    stepUpAt: session.stepUpAt ?? null,
  };
}
