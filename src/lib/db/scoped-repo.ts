import "server-only";
import { getTableColumns, getTableName, type SQL, sql } from "drizzle-orm";
import { alias, type BuildAliasTable, type PgColumn, type PgTable } from "drizzle-orm/pg-core";
import { isUserRole, type UserRole } from "@/lib/auth/roles";
import type { AnyDatabase, Database } from "./client";
import {
  auditLog,
  car,
  carSlugHistory,
  dealerSettings,
  inspection,
  inspectionPanel,
  journeyMilestone,
  media,
  place,
  priceChange,
  spinFrame,
  spinHotspot,
  spinSet,
} from "./schema";

// SEC-04: every query on dealer data takes its predicates from here. Each names the dealer, and the
// demo predicate its context calls for:
// - owner and staff read and write the live rows, and the cached public functions read them;
// - a demo session reads the live rows and its own, its private copies hiding their originals
//   (BR-31), and writes its own rows alone, so it never changes a seed or live row.
// A car's inspection, spin, journey and price rows are scoped through the car. The context is
// trusted: the auth session or the demo cookie's session made it, never client input.
//
// The repositories hand out predicates where SEC-04 says they add them: Drizzle's where() replaces
// an earlier one, and joins, subqueries and upserts need the predicate as a value. So scoped code
// keeps these rules, which the integration suite runs:
// - one where(and(repo.read(table), ...)) per statement, and no where() after it on a $dynamic()
//   query, which would replace the scope;
// - every scoped table a statement names takes its own predicate: each join (a left join's in its
//   ON), subquery and UPDATE ... FROM, and a second name for a table through read(table, as);
// - a new row's scope comes from values() and a change's SET from changes(), never from the data. An
//   insert ... select into a table with scope columns takes them from the context, not the source;
// - a row under a parent (a car's media, earlier slugs and child rows, a panel, frame or hotspot)
//   is inserted only under a parent found through write() by that id, and an id a row points to
//   (a media or place id, a featured car) is first found through read() of its table;
// - an upsert puts write(table) in setWhere. targetWhere only states a partial key's predicate,
//   so Postgres can choose that key, and filters nothing;
// - no relational queries, which move every column of a where clause onto the outer table, a
//   subquery's too, and would compare each car with itself in the copy check. The repositories'
//   `db` leaves out `query`, and the nested transactions whose tx has it again.

/** Owner or staff, from the auth session */
export type DealerContext = { readonly role: UserRole; readonly dealerId: string; readonly userId: string };

/** A demo session, found by the hash of its cookie's token (FR-45.2) */
export type DemoContext = { readonly role: "demo_dealer"; readonly dealerId: string; readonly sandboxId: string };

export type ScopeContext = DealerContext | DemoContext;

export type ScopedTable =
  | typeof auditLog
  | typeof car
  | typeof carSlugHistory
  | typeof dealerSettings
  | typeof inspection
  | typeof inspectionPanel
  | typeof journeyMilestone
  | typeof media
  | typeof place
  | typeof priceChange
  | typeof spinFrame
  | typeof spinHotspot
  | typeof spinSet;

/** The audit log is written once, in its action's transaction, and never changed */
export type WritableTable = Exclude<ScopedTable, typeof auditLog>;

/** The audit log is workspace data, which no public page shows */
export type PublicTable = Exclude<ScopedTable, typeof auditLog>;

/** The tables whose rows carry their own scope columns */
type OwnedTable =
  typeof auditLog | typeof car | typeof carSlugHistory | typeof dealerSettings | typeof media | typeof place;

/** A second name for a scoped table in one statement */
export type ScopedAlias<T extends ScopedTable> = BuildAliasTable<T, string>;

const SCOPE_COLUMNS = ["dealerId", "demoSessionId", "isPreset", "actorUserId", "actorDemoSessionId"] as const;
// A new row takes a fresh id, so a client's id can never meet another row's, and a place takes no
// key, which only the shared presets have
const FRESH_COLUMNS = ["id", "key"] as const;
// A change keeps the row where it is: its id, its scope, the parent it hangs under and its original
const FIXED_COLUMNS = [
  ...SCOPE_COLUMNS,
  ...FRESH_COLUMNS,
  "carId",
  "inspectionId",
  "spinSetId",
  "copiedFromCarId",
] as const;

/** A new row of an owned table, without the columns values() decides */
export type NewRow<T extends OwnedTable> = Omit<
  T["$inferInsert"],
  (typeof SCOPE_COLUMNS)[number] | (typeof FRESH_COLUMNS)[number]
>;

/** A change to a row, without the columns that keep it where it is */
export type Changes<T extends WritableTable> = Partial<Omit<T["$inferInsert"], (typeof FIXED_COLUMNS)[number]>>;

export type ScopedDatabase = Omit<AnyDatabase, "query" | "transaction">;

type Reads = "select" | "selectDistinct" | "selectDistinctOn";

/** What the cached public functions run: reads, and a batch of them that shares one snapshot */
export type PublicDatabase = Pick<Database, Reads | "$with" | "$count" | "batch"> & {
  with(...queries: Parameters<Database["with"]>): Pick<ReturnType<Database["with"]>, Reads>;
};

export type ScopedRepo = {
  readonly ctx: ScopeContext;
  readonly db: ScopedDatabase;
  /** The rows of the table this context may read, on the table or on an alias of it */
  read<T extends ScopedTable>(table: T, as?: ScopedAlias<T>): SQL;
  /** The rows of the table this context may change or delete */
  write<T extends WritableTable>(table: T, as?: ScopedAlias<T>): SQL;
  /** A new row owned by this context. Its scope columns go on last, over any the row carries */
  values<T extends OwnedTable>(table: T, row: NewRow<T>): T["$inferInsert"];
  /** The SET of a change to the table's rows, without any column that would move a row */
  changes<T extends WritableTable>(table: T, patch: Changes<T>): Changes<T>;
};

export type PublicRepo = {
  readonly dealerId: string;
  readonly db: PublicDatabase;
  /** The table's live rows, on the table or on an alias of it */
  read<T extends PublicTable>(table: T, as?: ScopedAlias<T>): SQL;
};

/** A table with its own dealer column, and a column naming the sandbox a row belongs to */
type OwnRule = {
  readonly kind: "own";
  readonly dealer: PgColumn;
  readonly sandbox: PgColumn;
  /** Shared: a sandbox reads the live rows with its own (SEC-04). Own: its own rows alone */
  readonly sandboxReads: "shared" | "own";
};

/** A table scoped through the parent row its column points to */
type ChildRule = {
  readonly kind: "child";
  readonly column: PgColumn;
  readonly parent: ScopedTable;
  readonly parentId: PgColumn;
};

const own = (dealer: PgColumn, sandbox: PgColumn, sandboxReads: OwnRule["sandboxReads"] = "shared"): OwnRule => ({
  kind: "own",
  dealer,
  sandbox,
  sandboxReads,
});

const child = (column: PgColumn, parent: ScopedTable, parentId: PgColumn): ChildRule => ({
  kind: "child",
  column,
  parent,
  parentId,
});

const RULES = new Map<ScopedTable, OwnRule | ChildRule>([
  [car, own(car.dealerId, car.demoSessionId)],
  [media, own(media.dealerId, media.demoSessionId)],
  [carSlugHistory, own(carSlugHistory.dealerId, carSlugHistory.demoSessionId)],
  [place, own(place.dealerId, place.demoSessionId)],
  // A session's settings row is made with the session, so it always stands in for the live one
  [dealerSettings, own(dealerSettings.dealerId, dealerSettings.demoSessionId, "own")],
  // The live rows are the workspace's, which a demo session never reads. A job's rows name no actor
  [auditLog, own(auditLog.dealerId, auditLog.actorDemoSessionId, "own")],
  [inspection, child(inspection.carId, car, car.id)],
  [spinSet, child(spinSet.carId, car, car.id)],
  [journeyMilestone, child(journeyMilestone.carId, car, car.id)],
  [priceChange, child(priceChange.carId, car, car.id)],
  [inspectionPanel, child(inspectionPanel.inspectionId, inspection, inspection.id)],
  [spinFrame, child(spinFrame.spinSetId, spinSet, spinSet.id)],
  [spinHotspot, child(spinHotspot.spinSetId, spinSet, spinSet.id)],
]);

export const SCOPED_TABLES: readonly ScopedTable[] = [...RULES.keys()];

/** The rows a context works on: the dealer's live rows, or a sandbox's view of them */
type Scope = { readonly dealerId: string; readonly sandboxId: string | null };

type Access = "read" | "write";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// demo_session_id_format: 128 random bits in base64url
const SANDBOX_ID = /^[A-Za-z0-9_-]{22}$/;
// The schema every table is in. The predicates' subqueries name their tables with it, so a CTE a
// statement names after a scoped table can't stand in for that table
const PUBLIC = sql.identifier("public");
const COPY = alias(car, "scope_copy");

const isAuditLog = (table: ScopedTable) => table === auditLog;

// Each predicate is one parenthesized group, because Drizzle's and() wraps its result and not its
// operands: an OR left bare would reach past the scope. Only the reference's own columns move onto
// an alias; a parent's subquery names its table itself
function predicate(table: ScopedTable, ref: PgTable, scope: Scope, access: Access): SQL {
  const rule = RULES.get(table);
  // An alias passed as the table ends here too: its columns name the alias, which the rules don't know
  if (rule === undefined) throw new Error(`No scope rule for the table ${getTableName(table)}`);
  if (rule.kind === "child") {
    const parent = predicate(rule.parent, rule.parent, scope, access);
    return sql`(${on(ref, rule.column)} in (select ${rule.parentId} from ${PUBLIC}.${rule.parent} where ${parent}))`;
  }
  const parts = [sql`${on(ref, rule.dealer)} = ${scope.dealerId}`, ...sandboxRows(table, ref, rule, scope, access)];
  const rows = sql`(${sql.join(parts, sql` and `)})`;
  // Every dealer reads the presets, and none writes one: a preset has no dealer
  return table === place && access === "read" ? sql`(${on(ref, place.isPreset)} or ${rows})` : rows;
}

function sandboxRows(table: ScopedTable, ref: PgTable, rule: OwnRule, scope: Scope, access: Access): SQL[] {
  const sandbox = on(ref, rule.sandbox);
  if (scope.sandboxId === null) return [sql`${sandbox} is null`];
  if (access === "write" || rule.sandboxReads === "own") return [sql`${sandbox} = ${scope.sandboxId}`];
  const shared = sql`(${sandbox} is null or ${sandbox} = ${scope.sandboxId})`;
  if (table !== car) return [shared];
  // BR-31: the session's private copy of a car stands in for the original
  const copy = sql`${COPY.copiedFromCarId} = ${on(ref, car.id)} and ${COPY.demoSessionId} = ${scope.sandboxId}`;
  return [shared, sql`not exists (select 1 from ${PUBLIC}.${car} as ${COPY} where ${copy})`];
}

/** The statement's name for the table: the table, or an alias of it, which keeps its columns */
function referenceOf(table: ScopedTable, as: PgTable | undefined): PgTable {
  if (as === undefined || as === table) return table;
  const name = getTableName(as);
  if (name === getTableName(COPY)) throw new Error(`The alias ${name} is the copy check's own`);
  // Drizzle's own marks of an alias are internal, so the columns tell: the same keys and names
  const columns = Object.entries(getTableColumns(table));
  const aliased = getTableColumns(as);
  const same =
    columns.length === Object.keys(aliased).length &&
    columns.every(([key, column]) => aliased[key]?.name === column.name);
  if (!same) throw new Error(`${name} is not an alias of ${getTableName(table)}`);
  return as;
}

/** The column on the reference: an alias renders the table's columns with its name, under their keys */
function on(ref: PgTable, column: PgColumn): PgColumn {
  if (ref === column.table) return column;
  const key = Object.entries(getTableColumns(column.table)).find(([, value]) => value === column)?.[0];
  const aliased = key === undefined ? undefined : getTableColumns(ref)[key];
  if (aliased === undefined) throw new Error(`${getTableName(ref)} has no column ${column.name}`);
  return aliased;
}

/** The context, checked and copied once. Trusted code made it, so a malformed id is a bug */
function trusted(ctx: ScopeContext): ScopeContext {
  if (ctx.role === "demo_dealer") {
    const { role, dealerId, sandboxId } = ctx;
    if (!UUID.test(dealerId) || !SANDBOX_ID.test(sandboxId)) {
      throw new RangeError("A demo context needs a dealer id and a sandbox id of the right form");
    }
    return Object.freeze({ role, dealerId, sandboxId });
  }
  const { role, dealerId, userId } = ctx;
  if (!isUserRole(role) || !UUID.test(dealerId) || !UUID.test(userId)) {
    throw new RangeError("A dealer context needs a dealer role, and a dealer id and a user id of the right form");
  }
  return Object.freeze({ role, dealerId, userId });
}

function scopeColumns(table: OwnedTable, ctx: ScopeContext) {
  const sandboxId = ctx.role === "demo_dealer" ? ctx.sandboxId : null;
  if (isAuditLog(table)) {
    return {
      dealerId: ctx.dealerId,
      actorUserId: ctx.role === "demo_dealer" ? null : ctx.userId,
      actorDemoSessionId: sandboxId,
    };
  }
  if (table === place) return { dealerId: ctx.dealerId, demoSessionId: sandboxId, isPreset: false };
  return { dealerId: ctx.dealerId, demoSessionId: sandboxId };
}

/** The row without the named columns, as a new object */
function without(row: object, columns: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !columns.includes(key)));
}

/** The repository of an owner's, a staff member's or a demo session's request */
export function scopedRepo(context: ScopeContext, db: AnyDatabase): ScopedRepo {
  const ctx = trusted(context);
  const scope: Scope = { dealerId: ctx.dealerId, sandboxId: ctx.role === "demo_dealer" ? ctx.sandboxId : null };
  return {
    ctx,
    db,
    read: (table, as) => predicate(table, referenceOf(table, as), scope, "read"),
    write(table, as) {
      if (isAuditLog(table)) throw new Error("audit_log rows are written once and never changed");
      return predicate(table, referenceOf(table, as), scope, "write");
    },
    values<T extends OwnedTable>(table: T, row: NewRow<T>): T["$inferInsert"] {
      if (RULES.get(table)?.kind !== "own") {
        throw new Error(`${getTableName(table)} rows take their scope from their parent row`);
      }
      return { ...without(row, FRESH_COLUMNS), ...scopeColumns(table, ctx) } as T["$inferInsert"];
    },
    // The table only types the patch: no table lets a change move a row
    changes: <T extends WritableTable>(_table: T, patch: Changes<T>) => without(patch, FIXED_COLUMNS) as Changes<T>,
  };
}

/** The cached public functions' repository: the dealer's live rows, and no cookie or session */
export function publicRepo(dealerId: string, db: Database): PublicRepo {
  if (!UUID.test(dealerId)) throw new RangeError("The public repository needs a dealer id of the right form");
  const scope: Scope = { dealerId, sandboxId: null };
  return {
    dealerId,
    db,
    read(table, as) {
      if (isAuditLog(table)) throw new Error("audit_log is workspace data, which no public page reads");
      return predicate(table, referenceOf(table, as), scope, "read");
    },
  };
}
