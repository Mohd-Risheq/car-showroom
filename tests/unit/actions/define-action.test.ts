import { updateTag } from "next/cache";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ActionCall, actionDefinitionOf, defineAction } from "@/lib/actions/define-action";
import { requireDealerSession } from "@/lib/auth/guard";
import { withTransaction } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import { AppError } from "@/lib/errors/app-error";
import { ERROR_CODES, type ErrorCode } from "@/lib/errors/codes";
import { rateLimitKey } from "@/lib/rate-limit/key";
import { consume } from "@/lib/rate-limit/store";
import { z } from "@/lib/validation/zod";

// SRS §11.9's defineAction: the origin (the owner's answer of 2026-10-24), the session and its
// guard (FR-29.6), the role (§4.2), the step-up (BR-41), Zod, the rate limit (§8.3), then the
// handler and its audit row in one transaction, and the cache tags once it commits (§8.1). Next.js,
// the auth library, the database and the limiter's store are stood in for here, and each step
// writes to one list, so a test reads their order. tests/integration/actions.test.ts runs the same
// path on Postgres.

const fake = vi.hoisted(() => {
  const events: string[] = [];
  const inserted: Array<{ table: unknown; row: unknown }> = [];
  return {
    events,
    inserted,
    headers: new Headers(),
    // The HTTP database, which only the limiter and a handler outside a transaction use
    db: { name: "http" },
    // A transaction's database, which records what is inserted
    tx: {
      insert: (table: unknown) => ({
        values: async (row: unknown) => {
          inserted.push({ table, row });
          events.push("audit");
        },
      }),
    },
  };
});

vi.mock("next/headers", () => ({ headers: async () => fake.headers }));
vi.mock("next/cache", () => ({ updateTag: vi.fn((tag: string) => fake.events.push(`updateTag ${tag}`)) }));
vi.mock("@/lib/auth/guard", () => ({ requireDealerSession: vi.fn() }));
vi.mock("@/lib/rate-limit/store", () => ({ consume: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: fake.db,
  withTransaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => {
    fake.events.push("begin");
    try {
      const result = await work(fake.tx);
      fake.events.push("commit");
      return result;
    } catch (error) {
      fake.events.push("rollback");
      throw error;
    }
  }),
}));

const SITE = "https://muftah.test";
const DEALER = "0192f5e0-0000-7000-8000-0000000000d1";
const USER = "0192f5e0-0000-7000-8000-0000000000a1";
const TARGET = "0192f5e0-0000-7000-8000-0000000000c1";
const REQUEST_ID = "fra1::abc-123";
const NOW = new Date("2026-10-24T09:00:00.000Z");
const FIVE_MINUTES = 5 * 60 * 1000;
const TEST_HMAC = "unit-test-hmac-input-not-a-real-one-0123";

const OWNER = { ctx: { role: "owner", dealerId: DEALER, userId: USER }, stepUpAt: null } as const;
const COUNT = z.object({ count: z.number().int() });
const BASE = { name: "testAction", roles: ["owner", "staff"], schema: COUNT, rateLimit: "API-17" } as const;

type Count = z.output<typeof COUNT>;

const succeed = async ({ input }: ActionCall<Count>) => ({ data: input.count * 2 });

/** A refusal as the action returns it: the code and its catalog message */
function refusal(code: ErrorCode) {
  return { ok: false, error: { code, message: ERROR_CODES[code].message } };
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  vi.stubEnv("RATE_LIMIT_HMAC_SECRET", TEST_HMAC);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
  fake.headers = new Headers({ "sec-fetch-site": "same-origin", "x-vercel-id": REQUEST_ID });
  fake.events.length = 0;
  fake.inserted.length = 0;
  vi.mocked(requireDealerSession).mockResolvedValue(OWNER);
  vi.mocked(consume).mockResolvedValue({ allowed: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("an action", () => {
  it("runs the handler with the parsed input, the context, a repository scoped to it and one clock", async () => {
    const handler = vi.fn(succeed);
    await expect(defineAction(BASE, handler)({ count: 21, extra: "dropped" })).resolves.toStrictEqual({
      ok: true,
      data: 42,
    });
    expect(handler).toHaveBeenCalledOnce();
    const call = handler.mock.calls[0]?.[0];
    expect(call?.input).toStrictEqual({ count: 21 });
    expect(call?.ctx).toStrictEqual(OWNER.ctx);
    expect(call?.repo.ctx).toStrictEqual(OWNER.ctx);
    expect(call?.repo.db).toBe(fake.tx);
    expect(call?.now).toStrictEqual(NOW);
    expect(call?.requestId).toBe(REQUEST_ID);
  });

  it("runs §11.9's steps in order, and updates the tags once the transaction commits (§8.1)", async () => {
    vi.mocked(requireDealerSession).mockImplementation(async () => {
      fake.events.push("session");
      return OWNER;
    });
    vi.mocked(consume).mockImplementation(async () => {
      fake.events.push("rate limit");
      return { allowed: true };
    });
    const action = defineAction({ ...BASE, audit: true }, async () => {
      fake.events.push("handler");
      return { data: null, tags: [`cars:${DEALER}`, `car:${TARGET}`] };
    });
    await action({ count: 1 });
    expect(fake.events).toStrictEqual([
      "session",
      "rate limit",
      "begin",
      "handler",
      "audit",
      "commit",
      `updateTag cars:${DEALER}`,
      `updateTag car:${TARGET}`,
    ]);
  });

  it("keeps the clock the call started with, however long its steps take", async () => {
    vi.mocked(consume).mockImplementation(async () => {
      vi.setSystemTime(NOW.getTime() + 1000);
      return { allowed: true };
    });
    const handler = vi.fn(succeed);
    await defineAction(BASE, handler)({ count: 1 });
    expect(handler.mock.calls[0]?.[0].now).toStrictEqual(NOW);
  });

  it("takes a request without Sec-Fetch-Site whose Origin is the site's own", async () => {
    fake.headers = new Headers({ origin: SITE });
    await expect(defineAction(BASE, succeed)({ count: 1 })).resolves.toStrictEqual({ ok: true, data: 2 });
  });

  it("counts the call against its row of §8.3, per user", async () => {
    await defineAction(BASE, succeed)({ count: 1 });
    expect(consume).toHaveBeenCalledExactlyOnceWith(
      fake.db,
      rateLimitKey(TEST_HMAC, { scope: "user", route: "API-17", subject: USER }, NOW),
      { max: 120, windowSeconds: 60 },
      NOW,
    );
  });

  it("runs outside a transaction when told to, on the database over HTTP, and still updates its tags", async () => {
    const handler = vi.fn(async ({ input }: ActionCall<Count>) => {
      fake.events.push("handler");
      return { data: input.count * 2, tags: [`cars:${DEALER}`, `car:${TARGET}`] };
    });
    await expect(defineAction({ ...BASE, transaction: false }, handler)({ count: 1 })).resolves.toStrictEqual({
      ok: true,
      data: 2,
    });
    expect(handler.mock.calls[0]?.[0].repo.db).toBe(fake.db);
    expect(withTransaction).not.toHaveBeenCalled();
    expect(fake.events).toStrictEqual(["handler", `updateTag cars:${DEALER}`, `updateTag car:${TARGET}`]);
  });
});

describe("an action refuses, and goes no further,", () => {
  it("a request from another site, before it reads the session", async () => {
    fake.headers = new Headers({ "sec-fetch-site": "cross-site", origin: "https://other.test" });
    const handler = vi.fn(succeed);
    expect(await defineAction(BASE, handler)({ count: 1 })).toStrictEqual(refusal("FORBIDDEN"));
    expect(requireDealerSession).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("a caller the guard refuses, before the role and the input", async () => {
    vi.mocked(requireDealerSession).mockRejectedValue(new AppError("UNAUTHENTICATED", "no session"));
    const handler = vi.fn(succeed);
    expect(await defineAction(BASE, handler)({ count: "not a number" })).toStrictEqual(refusal("UNAUTHENTICATED"));
    expect(consume).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("a role the action doesn't allow, before the step-up and the input (§4.2)", async () => {
    vi.mocked(requireDealerSession).mockResolvedValue({ ...OWNER, ctx: { ...OWNER.ctx, role: "staff" } });
    const handler = vi.fn(succeed);
    // A step-up wouldn't let this caller in, so none is asked for
    const ownerOnly = defineAction({ ...BASE, roles: ["owner"], stepUp: true }, handler);
    expect(await ownerOnly({ count: "not a number" })).toStrictEqual(refusal("FORBIDDEN"));
    expect(consume).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    ["one a millisecond older than five minutes", new Date(NOW.getTime() - FIVE_MINUTES - 1)],
    ["none at all", null],
  ])("a call that needs a step-up, with %s (BR-41), before the input", async (_case, stepUpAt) => {
    vi.mocked(requireDealerSession).mockResolvedValue({ ...OWNER, stepUpAt });
    const handler = vi.fn(succeed);
    expect(await defineAction({ ...BASE, stepUp: true }, handler)({ count: "not a number" })).toStrictEqual(
      refusal("STEP_UP_REQUIRED"),
    );
    expect(consume).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("input its schema refuses, with each field's problem, before the call is counted", async () => {
    const handler = vi.fn(succeed);
    expect(await defineAction(BASE, handler)({})).toStrictEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "errors.code.validationError",
        fieldErrors: { count: [{ key: "validation.required" }] },
      },
    });
    expect(consume).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("a call over its limit, with the seconds to wait, before a transaction opens", async () => {
    vi.mocked(consume).mockResolvedValue({ allowed: false, retryAfter: 12 });
    const handler = vi.fn(succeed);
    expect(await defineAction(BASE, handler)({ count: 1 })).toStrictEqual({
      ok: false,
      error: { code: "RATE_LIMITED", message: "errors.code.rateLimited", retryAfter: 12 },
    });
    expect(withTransaction).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("an action's step-up", () => {
  it("is taken exactly five minutes old, and isn't asked of an action that doesn't need one", async () => {
    vi.mocked(requireDealerSession).mockResolvedValue({ ...OWNER, stepUpAt: new Date(NOW.getTime() - FIVE_MINUTES) });
    await expect(defineAction({ ...BASE, stepUp: true }, succeed)({ count: 1 })).resolves.toStrictEqual({
      ok: true,
      data: 2,
    });
    vi.mocked(requireDealerSession).mockResolvedValue(OWNER);
    await expect(defineAction(BASE, succeed)({ count: 1 })).resolves.toStrictEqual({ ok: true, data: 2 });
  });
});

describe("an action's failures", () => {
  it("fail closed when the limiter's database can't be reached, before a transaction opens", async () => {
    const unreachable = new Error("fetch failed");
    vi.mocked(consume).mockRejectedValue(unreachable);
    const handler = vi.fn(succeed);
    await expect(defineAction(BASE, handler)({ count: 1 })).rejects.toBe(unreachable);
    expect(withTransaction).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("roll the transaction back on an AppError and return it, with its message, details and wait", async () => {
    const action = defineAction({ ...BASE, audit: true }, async () => {
      throw new AppError("RATE_LIMITED", "planted", {
        message: "errors.uploadsOff",
        details: { cap: 3 },
        retryAfter: 5,
      });
    });
    expect(await action({ count: 1 })).toStrictEqual({
      ok: false,
      error: { code: "RATE_LIMITED", message: "errors.uploadsOff", details: { cap: 3 }, retryAfter: 5 },
    });
    expect(fake.events).toStrictEqual(["begin", "rollback"]);
    expect(fake.inserted).toStrictEqual([]);
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("rethrow any other error as it is, after the rollback, with no tag updated", async () => {
    const bug = new TypeError("planted");
    const action = defineAction({ ...BASE, audit: true }, async () => {
      throw bug;
    });
    await expect(action({ count: 1 })).rejects.toBe(bug);
    expect(fake.events).toStrictEqual(["begin", "rollback"]);
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("are logged once, with the action, the code, the reason and the request ID, and no user or dealer", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.mocked(requireDealerSession).mockRejectedValue(new AppError("UNAUTHENTICATED", "no session"));
    await defineAction(BASE, succeed)({ count: 1 });
    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toStrictEqual({
      level: "warn",
      code: "UNAUTHENTICATED",
      action: "testAction",
      reason: "no session",
      requestId: REQUEST_ID,
      durationMs: expect.any(Number),
    });
  });
});

describe("an action's audit row (SEC-17)", () => {
  it("is written in the handler's transaction, named after the action, with its target and details", async () => {
    const action = defineAction({ ...BASE, audit: true }, async () => ({
      data: null,
      audit: { targetType: "car", targetId: TARGET, meta: { from: 100, to: 90 } },
    }));
    await action({ count: 1 });
    expect(fake.inserted).toStrictEqual([
      {
        table: auditLog,
        row: {
          action: "testAction",
          targetType: "car",
          targetId: TARGET,
          meta: { from: 100, to: 90 },
          dealerId: DEALER,
          actorUserId: USER,
          actorDemoSessionId: null,
        },
      },
    ]);
    expect(fake.events).toStrictEqual(["begin", "audit", "commit"]);
  });

  it("is written with no target when the handler names none, and not at all by an action that doesn't audit", async () => {
    await defineAction({ ...BASE, audit: true }, succeed)({ count: 1 });
    expect(fake.inserted.map(({ row }) => row)).toStrictEqual([
      { action: "testAction", meta: {}, dealerId: DEALER, actorUserId: USER, actorDemoSessionId: null },
    ]);
    fake.inserted.length = 0;
    await defineAction(BASE, succeed)({ count: 1 });
    expect(fake.inserted).toStrictEqual([]);
  });

  it("keeps the action's name and the database's time, whatever else the handler's object holds", async () => {
    // An object built earlier may hold more than a target, and only the target and details are taken
    const target = { targetType: "car", targetId: TARGET, action: "renamed", at: new Date(0) };
    await defineAction({ ...BASE, audit: true }, async () => ({ data: null, audit: target }))({ count: 1 });
    expect(fake.inserted.map(({ row }) => row)).toStrictEqual([
      {
        action: "testAction",
        targetType: "car",
        targetId: TARGET,
        meta: {},
        dealerId: DEALER,
        actorUserId: USER,
        actorDemoSessionId: null,
      },
    ]);
  });

  it("is the definition's to ask for, so no handler returns details its action would drop", () => {
    const withDetails = async () => ({ data: null, audit: { targetType: "car" } });
    // @ts-expect-error: an action that doesn't audit writes no row to hold them
    defineAction(BASE, withDetails);
    // @ts-expect-error: nor does one outside a transaction
    defineAction({ ...BASE, transaction: false }, withDetails);
  });

  it("refuses details under a name longer than the audit log keeps, and rolls the change back", async () => {
    const action = defineAction({ ...BASE, audit: true }, async () => ({
      data: null,
      audit: { meta: { ["x".repeat(41)]: 1 } },
    }));
    await expect(action({ count: 1 })).rejects.toThrow();
    expect(fake.inserted).toStrictEqual([]);
    expect(fake.events).toStrictEqual(["begin", "rollback"]);
  });
});

describe("a definition", () => {
  it("is registered with its name and roles, for the role matrix (TC-29-6)", () => {
    const action = defineAction(BASE, succeed);
    expect(actionDefinitionOf(action)).toStrictEqual({ name: "testAction", roles: ["owner", "staff"] });
    expect(actionDefinitionOf(async () => null)).toBeUndefined();
    // Such as an object, which a "use server" module can't export
    expect(actionDefinitionOf({ name: "testAction", roles: ["owner"] })).toBeUndefined();
  });

  it("is copied, so each call checks the roles the role matrix's test reads", async () => {
    vi.mocked(requireDealerSession).mockResolvedValue({ ...OWNER, ctx: { ...OWNER.ctx, role: "staff" } });
    const roles: ("owner" | "staff")[] = ["owner", "staff"];
    const definition: Omit<typeof BASE, "roles"> & { roles: readonly ("owner" | "staff")[] } = { ...BASE, roles };
    const action = defineAction(definition, succeed);
    // The list changed, then replaced, after the action is built
    roles.pop();
    definition.roles = ["owner"];
    expect(actionDefinitionOf(action)?.roles).toStrictEqual(["owner", "staff"]);
    await expect(action({ count: 1 })).resolves.toStrictEqual({ ok: true, data: 2 });
  });

  it("takes a name as long as the audit log keeps", () => {
    expect(() => defineAction({ ...BASE, name: "a".repeat(60) }, succeed)).not.toThrow();
  });

  it.each([
    ["no roles", { ...BASE, roles: [] }],
    ["an audit outside a transaction", { ...BASE, audit: true, transaction: false }],
    ["an empty name", { ...BASE, name: "" }],
    ["a name longer than the audit log keeps", { ...BASE, name: "a".repeat(61) }],
  ])("is refused with %s, when its module loads", (_case, definition) => {
    expect(() => defineAction(definition, succeed)).toThrow(Error);
  });
});
