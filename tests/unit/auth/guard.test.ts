import { afterEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth/auth";
import { requireDealerSession } from "@/lib/auth/guard";

// FR-29.6's guard, which every dealer action and handler runs: a session (SEC-03), a user who isn't
// disabled and has finished onboarding (BR-40), and a dealer role (§4.2). The auth library is stood
// in for; tests/integration/upload.test.ts and actions.test.ts run it for real.

vi.mock("@/lib/auth/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));

const DEALER = "0192f5e0-0000-7000-8000-0000000000d1";
const USER = "0192f5e0-0000-7000-8000-0000000000a1";
const STEP_UP = new Date("2026-10-24T08:58:00.000Z");

type Found = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
type User = Pick<Found["user"], "id" | "dealerId" | "role" | "disabledAt" | "mustChangePassword">;

const OWNER: User = { id: USER, dealerId: DEALER, role: "owner", disabledAt: null, mustChangePassword: false };

/** A session as the library finds it, with the fields the guard reads */
function found(user: Partial<User>, stepUpAt?: Date | null) {
  const session = stepUpAt === undefined ? {} : { stepUpAt };
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { ...OWNER, ...user }, session } as unknown as Found);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("requireDealerSession", () => {
  it("finds the session's dealer, user and role, and when it last stepped up", async () => {
    found({}, STEP_UP);
    const headers = new Headers({ cookie: "session=token" });
    await expect(requireDealerSession(headers)).resolves.toStrictEqual({
      ctx: { role: "owner", dealerId: DEALER, userId: USER },
      stepUpAt: STEP_UP,
    });
    expect(auth.api.getSession).toHaveBeenCalledExactlyOnceWith({ headers });
  });

  it.each([null, undefined])("gives no step-up time for a session that has %s", async (stepUpAt) => {
    found({ role: "staff" }, stepUpAt);
    await expect(requireDealerSession(new Headers())).resolves.toStrictEqual({
      ctx: { role: "staff", dealerId: DEALER, userId: USER },
      stepUpAt: null,
    });
  });

  it("refuses a request without a session as unauthenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    await expect(requireDealerSession(new Headers())).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
  });

  it.each<[string, Partial<User>]>([
    ["a disabled user, whose sessions disabling revokes (BR-41)", { disabledAt: new Date("2026-10-20T00:00:00Z") }],
    ["a user who must still change their password (BR-40)", { mustChangePassword: true }],
    // The column's enum holds owner and staff alone, so only a changed schema could hand it another
    ["a role the dealer side doesn't have", { role: "admin" } as unknown as Partial<User>],
  ])("refuses %s as forbidden", async (_case, user) => {
    found(user);
    await expect(requireDealerSession(new Headers())).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });
});
