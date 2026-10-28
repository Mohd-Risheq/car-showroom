import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requireDealerSession } from "@/lib/auth/guard";
import { TEMPORARY_SYMBOLS } from "@/lib/auth/temporary-password";
import { createPasswordUser } from "@/lib/auth/users";
import * as schema from "@/lib/db/schema";
import { account, dealer, user } from "@/lib/db/schema";
import type { OwnerInput } from "../../scripts/checks/owner-input.ts";
import type { ScriptDatabase, ScriptTransaction } from "../../scripts/database.ts";
import { createOwner } from "../../scripts/owner-account.ts";
import { signIn } from "../support/auth";
import { requireEnv } from "../support/env";

// scripts/create-owner.ts's account (SRS §6.4, D-045), written to the database the app's auth reads:
// the owner signs in with the file's password and must change it first, the rows are the ones
// createPasswordUser writes, and each refusal or failure leaves no account and no new password.

const run = crypto.randomUUID().slice(0, 8);
const PASSWORD_LINE = new RegExp(`^[${TEMPORARY_SYMBOLS}]{16}\n$`);
const ARGON2ID = "$argon2id$v=19$m=19456,t=2,p=1$";
const OWNER_CHILD = fileURLToPath(new URL("../support/create-owner-child.ts", import.meta.url));

let client: postgres.Sql | undefined;
let database: ScriptDatabase;
let folder = "";
const dealerIds: string[] = [];

beforeAll(() => {
  client = postgres(requireEnv("DATABASE_URL_UNPOOLED"), { max: 1, onnotice: () => {} });
  database = drizzle({ client, schema });
  folder = mkdtempSync(path.join(tmpdir(), "muftah-owner-"));
});

// A dealer can't go while a user belongs to it, so the users go first, with their accounts and sessions
afterAll(async () => {
  if (dealerIds.length > 0) {
    await database.delete(user).where(inArray(user.dealerId, dealerIds));
    await database.delete(dealer).where(inArray(dealer.id, dealerIds));
  }
  await client?.end();
  if (folder !== "") rmSync(folder, { recursive: true, force: true });
});

/** A dealer of this run's own */
async function newDealer(name: string) {
  const slug = `t17-${name}-${run}`;
  const [made] = await database.insert(dealer).values({ slug }).returning({ id: dealer.id });
  if (made === undefined) throw new Error(`Dealer ${slug} wasn't made`);
  dealerIds.push(made.id);
  return { id: made.id, slug };
}

/** Where a case's password goes, in a folder of its own */
const passwordFile = () => path.join(mkdtempSync(path.join(folder, "case-")), ".owner-password");

const emailFor = (name: string) => `t17-${name}-${run}@example.test`;

const fileText = (file: string) => (existsSync(file) ? readFileSync(file, "utf8") : null);

/** The accounts holding the address, and the users of the dealer */
async function accountsOf({ email, dealerSlug }: OwnerInput) {
  return {
    holders: await database.select({ id: user.id }).from(user).where(eq(user.email, email)),
    users: await database
      .select({ id: user.id })
      .from(user)
      .innerJoin(dealer, eq(dealer.id, user.dealerId))
      .where(eq(dealer.slug, dealerSlug)),
  };
}

/** The database, each of whose transactions runs inside `wrap` */
function wrapping(wrap: (work: () => Promise<unknown>) => Promise<unknown>): ScriptDatabase {
  return new Proxy(database, {
    get(target, key, receiver) {
      if (key !== "transaction") return Reflect.get(target, key, receiver);
      return (work: (tx: ScriptTransaction) => Promise<unknown>) => target.transaction((tx) => wrap(() => work(tx)));
    },
  });
}

async function createdOwner(input: OwnerInput, file: string): Promise<string> {
  const report = await createOwner(database, input, file);
  if ("refused" in report) throw new Error(`Refused:\n${report.refused.join("\n")}`);
  return report.ownerId;
}

describe("creating the owner", () => {
  it("writes the password to a file only its owner reads, and the owner signs in and must change it", async () => {
    const { id: dealerId, slug } = await newDealer("owner");
    const file = passwordFile();
    const email = emailFor("owner");
    const ownerId = await createdOwner({ dealerSlug: slug, email, name: "Muftah's owner" }, file);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    const line = readFileSync(file, "utf8");
    expect(line).toMatch(PASSWORD_LINE);

    const [owner] = await database.select().from(user).where(eq(user.id, ownerId));
    expect(owner).toMatchObject({
      email,
      name: "Muftah's owner",
      dealerId,
      role: "owner",
      mustChangePassword: true,
      emailVerified: false,
      disabledAt: null,
      tempPasswordExpiresAt: null,
    });
    const [credential] = await database.select().from(account).where(eq(account.userId, ownerId));
    expect(credential).toMatchObject({ providerId: "credential", accountId: ownerId });
    expect(credential?.password?.startsWith(ARGON2ID)).toBe(true);

    const cookie = await signIn({ email, password: line.trim() });
    await expect(requireDealerSession(new Headers({ cookie }))).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
  });

  it("writes the rows createPasswordUser writes, with the same columns left empty, beside a staff member", async () => {
    const { id: dealerId, slug } = await newDealer("shape");
    const { id: staffId } = await createPasswordUser({
      dealerId,
      email: emailFor("library"),
      name: "Staff",
      password: `t17-${crypto.randomUUID()}`,
      role: "staff",
      mustChangePassword: true,
    });
    // A staff member is no owner
    const ownerId = await createdOwner({ dealerSlug: slug, email: emailFor("shape"), name: "Owner" }, passwordFile());
    const emptyIn = (row: Record<string, unknown> | undefined) =>
      Object.entries(row ?? {}).flatMap(([column, value]) => (value === null ? [column] : []));
    const emptyColumns = async (userId: string) => ({
      user: emptyIn((await database.select().from(user).where(eq(user.id, userId)))[0]),
      account: emptyIn((await database.select().from(account).where(eq(account.userId, userId)))[0]),
    });
    expect(await emptyColumns(ownerId)).toStrictEqual(await emptyColumns(staffId));
  });

  it("lets one of two runs at once create the dealer's owner", async () => {
    const { slug } = await newDealer("twice");
    const input = (name: string) => ({ dealerSlug: slug, email: emailFor(`twice-${name}`), name: "Owner" });
    const other = postgres(requireEnv("DATABASE_URL_UNPOOLED"), { max: 1, onnotice: () => {} });
    try {
      let worked = () => {};
      const firstWorked = new Promise<void>((resolve) => {
        worked = resolve;
      });
      // The first run keeps its transaction open for a second after its writes, which the second meets
      const first = createOwner(
        wrapping(async (work) => {
          const written = await work();
          worked();
          await new Promise((resolve) => setTimeout(resolve, 1_000));
          return written;
        }),
        input("first"),
        passwordFile(),
      );
      await Promise.race([firstWorked, first]);
      const second = createOwner(drizzle({ client: other, schema }), input("second"), passwordFile());
      const reports = await Promise.all([first, second]);
      expect(reports.map((report) => ("refused" in report ? report.refused : "created"))).toStrictEqual([
        "created",
        [`dealer ${slug}: has an owner, whose reset is FR-29's own script`],
      ]);
    } finally {
      await other.end();
    }
  });
});

describe("refusing to create the owner", () => {
  /** The refusal, and that it left the accounts and the file as they were */
  async function refusal(input: OwnerInput, file = passwordFile()) {
    const before = [await accountsOf(input), fileText(file)];
    const report = await createOwner(database, input, file);
    expect([await accountsOf(input), fileText(file)]).toStrictEqual(before);
    if (!("refused" in report)) throw new Error("The owner was created");
    return report.refused;
  }

  it("refuses while the password file exists, and keeps it", async () => {
    const { slug } = await newDealer("kept");
    const file = passwordFile();
    writeFileSync(file, "an earlier password\n");
    expect(await refusal({ dealerSlug: slug, email: emailFor("kept"), name: "Owner" }, file)).toStrictEqual([
      ".owner-password exists, and no password is replaced (SRS §6.4)",
    ]);
  });

  it("refuses a dealer with an owner, and an address another account holds", async () => {
    const owned = await newDealer("owned");
    const email = emailFor("owned");
    await createdOwner({ dealerSlug: owned.slug, email, name: "Owner" }, passwordFile());
    const ownedProblem = `dealer ${owned.slug}: has an owner, whose reset is FR-29's own script`;
    const heldProblem = "OWNER_EMAIL: another account holds the address";
    expect(await refusal({ dealerSlug: owned.slug, email, name: "Owner" })).toStrictEqual([ownedProblem, heldProblem]);
    expect(await refusal({ dealerSlug: owned.slug, email: emailFor("second"), name: "Owner" })).toStrictEqual([
      ownedProblem,
    ]);
    const { slug } = await newDealer("other");
    expect(await refusal({ dealerSlug: slug, email, name: "Owner" })).toStrictEqual([heldProblem]);
  });

  it("refuses a dealer that isn't there", async () => {
    const dealerSlug = `t17-missing-${run}`;
    expect(await refusal({ dealerSlug, email: emailFor("missing"), name: "Owner" })).toStrictEqual([
      `dealer ${dealerSlug}: not found. The seed makes the demo dealer when DEMO_MODE=true, and a client's dealer has a step of its own (D-045)`,
    ]);
  });
});

describe("failing to create the owner", () => {
  it("leaves no account when the file can't be written", async () => {
    const { slug } = await newDealer("unwritable");
    const input = { dealerSlug: slug, email: emailFor("unwritable"), name: "Owner" };
    const file = path.join(folder, "no-such-folder", ".owner-password");
    await expect(createOwner(database, input, file)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await accountsOf(input)).toStrictEqual({ holders: [], users: [] });
  });

  it("removes the file when the rows don't commit", async () => {
    const { slug } = await newDealer("uncommitted");
    const input = { dealerSlug: slug, email: emailFor("uncommitted"), name: "Owner" };
    const file = passwordFile();
    const failing = wrapping(async (work) => {
      await work();
      throw new Error("The commit failed");
    });
    await expect(createOwner(failing, input, file)).rejects.toThrow("The commit failed");
    expect([fileText(file), await accountsOf(input)]).toStrictEqual([null, { holders: [], users: [] }]);
  });

  it("removes the file when its write fails after the open made it, and leaves no account", async () => {
    const { slug } = await newDealer("full");
    const input = { dealerSlug: slug, email: emailFor("full"), name: "Owner" };
    const file = passwordFile();
    // Under a file size limit of 0, the open makes the file and the write fails with EFBIG
    const child = spawnSync(
      "bash",
      ["-c", 'ulimit -f 0 && exec "$0" "$@"', process.execPath, OWNER_CHILD, slug, input.email, file],
      { encoding: "utf8" },
    );
    expect(JSON.parse(child.stdout)).toStrictEqual({ failed: "EFBIG" });
    expect([fileText(file), await accountsOf(input)]).toStrictEqual([null, { holders: [], users: [] }]);
  });

  it("keeps a file another run wrote after the check, and leaves no account", async () => {
    const { slug } = await newDealer("raced");
    const input = { dealerSlug: slug, email: emailFor("raced"), name: "Owner" };
    const file = passwordFile();
    const racing = wrapping((work) => {
      writeFileSync(file, "another run's password\n");
      return work();
    });
    await expect(createOwner(racing, input, file)).rejects.toMatchObject({ code: "EEXIST" });
    expect([fileText(file), await accountsOf(input)]).toStrictEqual([
      "another run's password\n",
      { holders: [], users: [] },
    ]);
  });
});
