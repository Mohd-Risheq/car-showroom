import { readFileSync } from "node:fs";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { is } from "drizzle-orm";
import { getTableConfig, isPgEnum, PgDialect, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { uuidv7 } from "@/lib/db/id";
import * as schema from "@/lib/db/schema";

// The schema module against drizzle-kit's latest snapshot (SRS §6, §17.2), and the rules every
// table keeps: names Postgres holds whole, checks and predicates written as literal SQL, indexed
// foreign keys, ids made in the app and updated_at set on each update.

const declared: unknown[] = Object.values(schema);
const tables = declared.filter((value): value is PgTable => is(value, PgTable)).map((table) => getTableConfig(table));
const enums = declared.filter(isPgEnum);

type Table = (typeof tables)[number];

type Journal = { entries: { idx: number }[] };

function latestSnapshot() {
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as Journal;
  const latest = journal.entries.at(-1);
  if (!latest) throw new Error("drizzle/meta/_journal.json lists no migration");
  const file = `drizzle/meta/${String(latest.idx).padStart(4, "0")}_snapshot.json`;
  return JSON.parse(readFileSync(file, "utf8")) as Parameters<typeof generateMigration>[0];
}

/** Every name the schema gives a constraint or an index, as Postgres will hold it */
function namesOf(table: Table): string[] {
  return [
    ...table.indexes.map((index) => index.config.name ?? ""),
    ...table.checks.map((check) => check.name),
    ...table.foreignKeys.map((key) => key.getName()),
    ...table.primaryKeys.map((key) => key.getName()),
    ...table.uniqueConstraints.map((constraint) => constraint.getName() ?? ""),
    ...table.columns.flatMap((column) => (column.isUnique && column.uniqueName ? [column.uniqueName] : [])),
  ];
}

/** The column lists Postgres can search a table by: keys, unique constraints and whole indexes */
function searchableColumns(table: Table): string[][] {
  const named = (columns: readonly { name: string }[]) => columns.map((column) => column.name);
  return [
    ...table.columns.filter((column) => column.primary || column.isUnique).map((column) => [column.name]),
    ...table.primaryKeys.map((key) => named(key.columns)),
    ...table.uniqueConstraints.map((constraint) => named(constraint.columns)),
    // A partial index serves only rows its predicate admits, so it can't serve a key's checks
    ...table.indexes
      .filter((index) => !index.config.where)
      .map((index) => index.config.columns.map((column) => ("name" in column ? String(column.name) : ""))),
  ];
}

// No action or job deletes a dealer or the reference data, so no key to them needs an index
const NEVER_DELETED = new Set(["dealer", "make", "model"]);

describe("the schema module", () => {
  it("has a migration for every change, so pnpm db:generate has nothing left to write", async () => {
    const snapshot = latestSnapshot();
    const current = generateDrizzleJson(schema, snapshot.id);
    expect(await generateMigration(snapshot, current)).toEqual([]);
  });

  it("names every index, and keeps every name within the 63 bytes Postgres holds", () => {
    const names = tables.flatMap(namesOf);
    expect(names.filter((name) => name === "")).toEqual([]);
    expect(names.filter((name) => Buffer.byteLength(name) > 63)).toEqual([]);
  });

  it("writes each check's and each partial index's values into its SQL text", () => {
    // drizzle-kit keeps a check's or a predicate's text and drops its bound values
    const dialect = new PgDialect();
    const bound = tables.flatMap((table) => [
      ...table.checks.filter((check) => dialect.sqlToQuery(check.value).params.length > 0).map((check) => check.name),
      ...table.indexes
        .filter(({ config }) => config.where && dialect.sqlToQuery(config.where).params.length > 0)
        .map(({ config }) => config.name),
    ]);
    expect(bound).toEqual([]);
  });

  it("indexes each foreign key whose parent rows are deleted, so a delete never scans the child table", () => {
    const unindexed = tables.flatMap((table) =>
      table.foreignKeys
        .filter((key) => !NEVER_DELETED.has(getTableConfig(key.reference().foreignTable).name))
        .filter((key) => {
          const columns = key.reference().columns.map((column) => column.name);
          return !searchableColumns(table).some((searchable) =>
            columns.every((column) => searchable.slice(0, columns.length).includes(column)),
          );
        })
        .map((key) => key.getName()),
    );
    expect(unindexed).toEqual([]);
  });

  it("makes every uuid primary key a UUIDv7 in the app (SRS §6)", () => {
    const others = tables.flatMap((table) =>
      table.columns
        .filter((column) => column.primary && column.getSQLType() === "uuid" && column.defaultFn !== uuidv7)
        .map((column) => `${table.name}.${column.name}`),
    );
    expect(others).toEqual([]);
  });

  it("sets updated_at on every update (SRS §6)", () => {
    const unset = tables.flatMap((table) =>
      table.columns.filter((column) => column.name === "updated_at" && !column.onUpdateFn).map(() => table.name),
    );
    expect(unset).toEqual([]);
  });

  it("lists each labelled enum's values in the order of SRS §6.3, as the catalogs label them", () => {
    const catalog = JSON.parse(readFileSync("messages/en.json", "utf8")) as { enum: Record<string, object> };
    const labelled = Object.fromEntries(
      Object.entries(catalog.enum).map(([name, labels]) => [name, Object.keys(labels)]),
    );
    const declared = Object.fromEntries(
      enums.filter((pgEnum) => pgEnum.enumName in labelled).map((pgEnum) => [pgEnum.enumName, [...pgEnum.enumValues]]),
    );
    expect(declared).toEqual(labelled);
  });
});
