import "server-only";
import { updateTag } from "next/cache";
import { headers } from "next/headers";
import { requireDealerSession } from "@/lib/auth/guard";
import type { UserRole } from "@/lib/auth/roles";
import { isSameOrigin } from "@/lib/auth/same-origin";
import { db, withTransaction } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import { type DealerContext, type ScopedRepo, scopedRepo } from "@/lib/db/scoped-repo";
import { AppError } from "@/lib/errors/app-error";
import { logRefusal } from "@/lib/errors/refusal";
import { requestIdFrom } from "@/lib/log/request-id";
import { rateLimitKey, rateLimitSecret } from "@/lib/rate-limit/key";
import { type LimitedRoute, ROUTE_LIMITS } from "@/lib/rate-limit/routes";
import { consume } from "@/lib/rate-limit/store";
import { type AuditMeta, auditMetaSchema } from "@/lib/validation/audit";
import { validate } from "@/lib/validation/issues";
import type { z } from "@/lib/validation/zod";
import type { ActionError, ActionResult } from "./result";

// SRS §11.9: every Server Action is built here. A call runs, in order:
//  1. the origin: Sec-Fetch-Site or the site's own Origin (the owner's answer of 2026-10-24);
//  2. the session and its guard (FR-29.6), then the action's roles (§4.2);
//  3. the step-up, where the action asks for one (BR-41);
//  4. the input's schema (SEC-13), then the rate limit (§8.3);
//  5. the handler and its audit row, in one transaction (SEC-17);
//  6. once that commits, the cache tags the handler returns (§8.1).
// A refusal comes back as §8.1's result and is logged once; any other error is rethrown as it is,
// for the route's error boundary. An action takes one plain object, called through startTransition:
// a form's (prevState, formData) would reach the schema as its input. T-29 adds the demo session:
// its context, no step-up, and refresh() in place of the tags.

/** BR-41: how long a step-up lasts */
const STEP_UP_MS = 5 * 60 * 1000;
/** The longest name audit_log.action holds */
const MAX_NAME = 60;

export type ActionDefinition<Schema extends z.ZodType, Audits extends boolean = boolean> = {
  /** The action's name, in its log lines, its audit rows and the role matrix (TC-29-6) */
  readonly name: string;
  /** The roles SRS §4.2 allows */
  readonly roles: readonly UserRole[];
  /** The input's shape, shared with the client; unknown keys are dropped (SRS §8.1) */
  readonly schema: Schema;
  /** Its row of SRS §8.3, counted per user */
  readonly rateLimit: LimitedRoute;
  /** Writes an audit row named after the action, in the handler's transaction (SEC-17) */
  readonly audit?: Audits;
  /** Needs a step-up within the last 5 minutes (BR-41) */
  readonly stepUp?: boolean;
  /** false runs the handler outside a transaction, for work that waits on storage. It can't audit. */
  readonly transaction?: boolean;
};

/** What a handler is called with */
export type ActionCall<Input> = {
  readonly input: Input;
  readonly ctx: DealerContext;
  readonly repo: ScopedRepo;
  /** The call's one clock, which the rate limit read too */
  readonly now: Date;
  readonly requestId: string;
};

/** An audit row's target and details */
export type AuditDetails = { readonly targetType?: string; readonly targetId?: string; readonly meta?: AuditMeta };

/** What a handler returns. It throws an AppError to refuse, which rolls its transaction back. */
export type ActionOutcome<Data, Audits extends boolean = boolean> = {
  readonly data: Data;
  /** The cache tags its change touched (SRS §8.1), updated once the transaction commits */
  readonly tags?: readonly string[];
  /** Only for an action that audits, which has a row to write them in */
  readonly audit?: true extends Audits ? AuditDetails : never;
};

export type Action<Data> = (input: unknown) => Promise<ActionResult<Data>>;

type Handler<Schema extends z.ZodType, Data, Audits extends boolean> = (
  call: ActionCall<z.output<Schema>>,
) => Promise<ActionOutcome<Data, Audits>>;

type Registered = { readonly name: string; readonly roles: readonly UserRole[] };

// Every action built here, for the role matrix's test (TC-29-6)
const registry = new WeakMap<object, Registered>();

/** The name and roles an action was defined with, or undefined for a function built elsewhere */
export function actionDefinitionOf(action: unknown): Registered | undefined {
  return typeof action === "function" ? registry.get(action) : undefined;
}

// The definition alone decides whether the handler may return audit details
export function defineAction<Schema extends z.ZodType, Data, Audits extends boolean = false>(
  definition: ActionDefinition<Schema, Audits>,
  handler: Handler<Schema, Data, NoInfer<Audits>>,
): Action<Data> {
  checkDefinition(definition);
  // Copied once, so the roles the role matrix's test reads are the ones every call checks
  const fixed = Object.freeze({ ...definition, roles: Object.freeze([...definition.roles]) });
  const action: Action<Data> = async (input) => {
    const started = performance.now();
    const requestHeaders = await headers();
    const requestId = requestIdFrom(requestHeaders);
    try {
      return { ok: true, data: await run(fixed, handler, input, requestHeaders, requestId) };
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      logRefusal(error, { action: fixed.name, requestId, durationMs: Math.round(performance.now() - started) });
      return { ok: false, error: failureOf(error) };
    }
  };
  registry.set(action, { name: fixed.name, roles: fixed.roles });
  return action;
}

// Checked when the action's module loads, so a wrong definition fails every call and the role
// matrix's test, never one call in production
function checkDefinition({
  name,
  roles,
  audit,
  transaction,
}: Pick<ActionDefinition<z.ZodType>, "name" | "roles" | "audit" | "transaction">): void {
  if (name.length === 0 || name.length > MAX_NAME) {
    throw new Error(`An action's name has 1 to ${MAX_NAME} characters, which "${name}" hasn't`);
  }
  if (roles.length === 0) throw new Error(`${name} allows no role`);
  if (audit && transaction === false) throw new Error(`${name} writes its audit row in its transaction, so needs one`);
}

async function run<Schema extends z.ZodType, Data, Audits extends boolean>(
  definition: ActionDefinition<Schema, Audits>,
  handler: Handler<Schema, Data, Audits>,
  input: unknown,
  requestHeaders: Headers,
  requestId: string,
): Promise<Data> {
  const now = new Date();
  if (!isSameOrigin(requestHeaders)) throw new AppError("FORBIDDEN", "not same-origin");
  const { ctx, stepUpAt } = await requireDealerSession(requestHeaders);
  if (!definition.roles.includes(ctx.role)) throw new AppError("FORBIDDEN", "role");
  if (definition.stepUp && !isRecent(stepUpAt, now)) throw new AppError("STEP_UP_REQUIRED", "step-up");
  const parsed = validate(definition.schema, input);
  if (!parsed.ok) throw new AppError("VALIDATION_ERROR", "input", { fieldErrors: parsed.fieldErrors });
  await countCall(definition.rateLimit, ctx, now);

  const call = (repo: ScopedRepo) => handler({ input: parsed.data, ctx, repo, now, requestId });
  const outcome =
    definition.transaction === false
      ? await call(scopedRepo(ctx, db))
      : await withTransaction(async (tx) => {
          const repo = scopedRepo(ctx, tx);
          const result = await call(repo);
          if (definition.audit) await repo.db.insert(auditLog).values(auditRow(repo, definition.name, result.audit));
          return result;
        });
  // Only once the change has committed, so a reader can't refill an entry with the old row (TC-31-9)
  for (const tag of outcome.tags ?? []) updateTag(tag);
  return outcome.data;
}

function isRecent(stepUpAt: Date | null, now: Date): boolean {
  return stepUpAt !== null && now.getTime() - stepUpAt.getTime() <= STEP_UP_MS;
}

// The rate limit reads the database, so a call it can't count fails as the handler would (D-043)
async function countCall(route: LimitedRoute, ctx: DealerContext, now: Date): Promise<void> {
  const key = rateLimitKey(rateLimitSecret(), { scope: "user", route, subject: ctx.userId }, now);
  const verdict = await consume(db, key, ROUTE_LIMITS[route], now);
  if (!verdict.allowed) throw new AppError("RATE_LIMITED", route, { retryAfter: verdict.retryAfter });
}

// The target and details by name, so an object that holds more can't rename or date the row
function auditRow(repo: ScopedRepo, action: string, audit: AuditDetails | undefined) {
  const { targetType, targetId, meta } = audit ?? {};
  return repo.values(auditLog, {
    action,
    ...(targetType === undefined ? {} : { targetType }),
    ...(targetId === undefined ? {} : { targetId }),
    meta: auditMetaSchema.parse(meta ?? {}),
  });
}

function failureOf(error: AppError): ActionError {
  return {
    code: error.code,
    message: error.messageKey,
    ...(error.fieldErrors === undefined ? {} : { fieldErrors: error.fieldErrors }),
    ...(error.details === undefined ? {} : { details: error.details }),
    ...(error.retryAfter === undefined ? {} : { retryAfter: error.retryAfter }),
  };
}
