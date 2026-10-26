import { z } from "./zod.ts";

// An audit row's details (audit_log.meta): JSON values under short names. No secrets go in, and no
// personal data beyond the user id the row already holds (SEC-09).

export const auditMetaSchema = z.record(z.string().min(1).max(40), z.json());

export type AuditMeta = z.output<typeof auditMetaSchema>;
