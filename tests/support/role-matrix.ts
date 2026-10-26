import type { UserRole } from "@/lib/auth/roles";

// TC-29-6's matrix: the roles SRS §4.2 allows each Server Action, by the action's name. Where §4.2
// allows a role that a later task brings, the row names it under `later`, with that task. Each
// task adds its actions' rows (BUILD-PLAN §3.2), and tests/integration/actions.test.ts checks every
// action against its row.

export type MatrixRole = UserRole | "demo_dealer";

export type MatrixRow = {
  readonly roles: readonly MatrixRole[];
  readonly later?: Readonly<Partial<Record<MatrixRole, string>>>;
};

export const ROLE_MATRIX: Readonly<Record<string, MatrixRow>> = {
  // Edit car, media, inspection, journey, audio: ◐ on a demo session's own cars and copies
  registerMedia: { roles: ["owner", "staff"], later: { demo_dealer: "T-32" } },
};
