import { globSync, readFileSync } from "node:fs";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { updateTag } from "next/cache";
import { headers } from "next/headers";
import ts from "typescript";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { registerMediaAction } from "@/features/dealer/server/actions";
import { actionDefinitionOf, defineAction } from "@/lib/actions/define-action";
import { db, withTransaction } from "@/lib/db/client";
import { auditLog, place } from "@/lib/db/schema";
import { AppError } from "@/lib/errors/app-error";
import { registerMedia } from "@/lib/storage/register";
import { z } from "@/lib/validation/zod";
import { createTestUser, deleteTestUsers, signIn } from "../support/auth";
import { testDealerId } from "../support/dealer";
import { ROLE_MATRIX } from "../support/role-matrix";

// SRS §11.9's defineAction on Postgres and the auth library: every Server Action is built with it
// and has its row in the role matrix (TC-29-6), registerMedia's action runs the guard and the
// schema before the storage checks, and a handler's change commits with its audit row or rolls
// back with it (SEC-17). Next.js's request headers and cache are stood in for.

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("@/lib/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/client")>();
  return { ...actual, withTransaction: vi.fn(actual.withTransaction) };
});
vi.mock("@/lib/storage/register", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/register")>();
  return { ...actual, registerMedia: vi.fn(actual.registerMedia) };
});

const users: Record<"owner" | "staff", { id: string; cookie: string }> = {
  owner: { id: "", cookie: "" },
  staff: { id: "", cookie: "" },
};

const REQUEST_ID = "fra1::actions-test";

/** The headers of a request the action reads: from the site's own page, as one of the users */
function request(init: { cookie?: string; fetchSite?: string; origin?: string }): void {
  const sent = new Headers({ "sec-fetch-site": init.fetchSite ?? "same-origin", "x-vercel-id": REQUEST_ID });
  if (init.cookie) sent.set("cookie", init.cookie);
  if (init.origin) sent.set("origin", init.origin);
  vi.mocked(headers).mockResolvedValue(sent as unknown as Awaited<ReturnType<typeof headers>>);
}

beforeAll(async () => {
  for (const role of ["owner", "staff"] as const) {
    const created = await createTestUser(role);
    users[role] = { id: created.id, cookie: await signIn(created) };
  }
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  await db.delete(auditLog).where(eq(auditLog.action, "testRecordPlace"));
  await db.delete(place).where(sql`${place.nameEn} like 'test-record-place-%'`);
  await deleteTestUsers();
});

/** Each top-level "use server" module under src: the files whose directive prologue holds it */
function serverActionModules(): string[] {
  return globSync("src/**/*.{ts,tsx}").filter((file) => {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest);
    for (const statement of source.statements) {
      if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) return false;
      if (statement.expression.text === "use server") return true;
    }
    return false;
  });
}

describe("every Server Action (TC-29-6)", () => {
  it("is an export of an actions.ts module, built with defineAction, with its row in the role matrix", async () => {
    const modules = serverActionModules();
    // A broken search would find nothing and pass
    expect(modules.length).toBeGreaterThan(0);
    const names = new Set<string>();
    for (const file of modules) {
      // The redirect and cache bans of eslint.config.mjs cover the modules by this name
      expect(path.basename(file), file).toBe("actions.ts");
      const exported: Record<string, unknown> = await import(path.resolve(file));
      for (const [exportName, value] of Object.entries(exported)) {
        const definition = actionDefinitionOf(value);
        expect(definition, `${file}: ${exportName} isn't built with defineAction`).toBeDefined();
        if (!definition) continue;
        expect(names.has(definition.name), `${definition.name} is defined twice`).toBe(false);
        names.add(definition.name);
        const row = ROLE_MATRIX[definition.name];
        expect(row, `${definition.name} has no row in the role matrix`).toBeDefined();
        expect([...definition.roles].sort(), definition.name).toStrictEqual([...(row?.roles ?? [])].sort());
      }
    }
    expect([...names].sort()).toStrictEqual(Object.keys(ROLE_MATRIX).sort());
  });
});

describe("registerMedia's action (API-17)", () => {
  const upload = () => ({
    carId: crypto.randomUUID(),
    kind: "photo",
    clientUploadId: crypto.randomUUID(),
    variants: { "480": "https://store.test/x.webp" },
  });

  it("refuses a signed-out caller and another site's page before the storage checks", async () => {
    request({});
    await expect(registerMediaAction(upload())).resolves.toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
    request({ cookie: users.owner.cookie, fetchSite: "cross-site", origin: "https://other.test" });
    await expect(registerMediaAction(upload())).resolves.toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(registerMedia).not.toHaveBeenCalled();
  });

  it("returns each field's problem for malformed input, and never reaches the storage checks", async () => {
    request({ cookie: users.staff.cookie });
    const result = await registerMediaAction({ carId: "not-a-uuid", kind: "video", variants: {} });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(result.ok ? {} : Object.keys(result.error.fieldErrors ?? {}).sort()).toStrictEqual([
      "carId",
      "clientUploadId",
      "kind",
    ]);
    expect(registerMedia).not.toHaveBeenCalled();
  });

  it("hands the parsed input, the session's user and the request ID to the storage checks", async () => {
    request({ cookie: users.owner.cookie });
    const input = upload();
    // No token was issued for this upload, which the storage checks answer
    await expect(registerMediaAction({ ...input, extra: "dropped" })).resolves.toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(registerMedia).toHaveBeenCalledExactlyOnceWith(input, { userId: users.owner.id }, REQUEST_ID);
    // Outside a transaction, which would hold its connection while the checks read the store (D-043)
    expect(withTransaction).not.toHaveBeenCalled();
  });
});

describe("a handler's change and its audit row (SEC-17)", () => {
  const recordPlace = defineAction(
    {
      name: "testRecordPlace",
      roles: ["owner"],
      schema: z.object({ marker: z.string(), fail: z.boolean() }),
      rateLimit: "API-17",
      audit: true,
    },
    async ({ input, repo }) => {
      const [row] = await repo.db
        .insert(place)
        .values(repo.values(place, { nameAr: input.marker, nameEn: input.marker }))
        .returning({ id: place.id });
      if (!row) throw new Error("the place insert returned no row");
      if (input.fail) throw new AppError("VALIDATION_ERROR", "refused after the write");
      return {
        data: row.id,
        tags: [`dealer:${repo.ctx.dealerId}`],
        audit: { targetType: "place", targetId: row.id, meta: { marker: input.marker } },
      };
    },
  );
  const marker = () => `test-record-place-${crypto.randomUUID()}`;
  const auditRows = (name: string) =>
    db
      .select({ targetId: auditLog.targetId, actorUserId: auditLog.actorUserId, dealerId: auditLog.dealerId })
      .from(auditLog)
      .where(and(eq(auditLog.action, "testRecordPlace"), sql`${auditLog.meta}->>'marker' = ${name}`));

  it("commit together, and the tags are updated after", async () => {
    request({ cookie: users.owner.cookie });
    const name = marker();
    const result = await recordPlace({ marker: name, fail: false });
    expect(result).toMatchObject({ ok: true });
    const id = result.ok ? result.data : "";
    const dealerId = await testDealerId();
    expect(await db.select({ dealerId: place.dealerId }).from(place).where(eq(place.id, id))).toStrictEqual([
      { dealerId },
    ]);
    expect(await auditRows(name)).toStrictEqual([{ targetId: id, actorUserId: users.owner.id, dealerId }]);
    expect(updateTag).toHaveBeenCalledExactlyOnceWith(`dealer:${dealerId}`);
  });

  it("roll back together when the handler refuses, and no tag is updated", async () => {
    request({ cookie: users.owner.cookie });
    const name = marker();
    await expect(recordPlace({ marker: name, fail: true })).resolves.toStrictEqual({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "errors.code.validationError" },
    });
    expect(await db.select({ id: place.id }).from(place).where(eq(place.nameEn, name))).toStrictEqual([]);
    expect(await auditRows(name)).toStrictEqual([]);
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("are refused to a role the action doesn't allow, before the handler runs", async () => {
    request({ cookie: users.staff.cookie });
    const name = marker();
    await expect(recordPlace({ marker: name, fail: false })).resolves.toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(await db.select({ id: place.id }).from(place).where(eq(place.nameEn, name))).toStrictEqual([]);
  });
});
