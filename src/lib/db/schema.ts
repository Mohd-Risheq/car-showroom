import { bigint, boolean, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Auth tables (ENT-User, SRS §11.2). Property names are the auth library's field names and
// columns are snake_case. The library checks this object against its config at the first
// request, so a field it writes must exist here and any other column must be nullable or
// have a default. T-16 adds the rest of SRS §6 (dealer_id included); T-28 adds two-step
// sign-in and the rate-limit table.

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const userRole = pgEnum("user_role", ["owner", "staff"]);

export const user = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  // Server-owned fields, declared to the library with input: false (FR-29.11)
  role: userRole("role").notNull().default("staff"),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  disabledAt: timestamptz("disabled_at"),
  tempPasswordExpiresAt: timestamptz("temp_password_expires_at"),
  totpLastStep: bigint("totp_last_step", { mode: "number" }),
});

export const session = pgTable(
  "session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expiresAt: timestamptz("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    // Always null: the session.create.before hook drops it (SEC-02)
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Set only by the step-up action (BR-41, API-32)
    stepUpAt: timestamptz("step_up_at"),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // For the credential provider this is the user's id: the library's password update matches on it
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamptz("access_token_expires_at"),
    refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);
