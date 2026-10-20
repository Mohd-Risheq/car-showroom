// The two dealer roles (SRS §4.2). The database enum, the auth library's field and every role
// check read this list. Import-free, so the schema can read it under drizzle-kit too.
export const USER_ROLES = ["owner", "staff"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return USER_ROLES.some((role) => role === value);
}
