import "server-only";
import { type LogLevel, log } from "@/lib/log/logger";
import type { AppError } from "./app-error";

/** Where a refusal happened: the route or the action, the request's ID, and the time it took */
type Placement = {
  readonly route?: string;
  readonly action?: string;
  readonly requestId: string;
  readonly durationMs: number;
};

/** Logs a refusal once (SRS §11.9): its code and reason, beside the fields that place it */
export function logRefusal(error: AppError, fields: Placement): void {
  log(levelOf(error.status), error.code, { ...fields, reason: error.message });
}

// A server's failure is an error, a refused sign-in or permission a warning, other refusals news
function levelOf(status: number): LogLevel {
  if (status >= 500) return "error";
  return status === 401 || status === 403 ? "warn" : "info";
}
