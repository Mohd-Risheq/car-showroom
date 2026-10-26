import type { FieldErrors } from "../errors/app-error.ts";
import { ANY_FIELD_MESSAGES, RULE_MESSAGES, type ValidationKey } from "./messages.ts";
import type { z } from "./zod.ts";

// A form shows each field's problem as a catalog message, with the numbers the message fills in
// (SRS §7.1, D-040). A rule raises it with addIssue, and validate() hands the form each field's.

// The numbers each validation message fills in, named as its ICU arguments are (DESIGN §9.2). A
// unit test reads every message's arguments in both catalogs, so the two can't drift apart.
export const MESSAGE_VALUES = {
  "validation.year": ["maxYear"],
  "validation.maxChars": ["max"],
  "validation.fileSize": ["max"],
  "validation.range": ["min", "max"],
  "validation.spinFrames": ["max"],
} as const satisfies Partial<Record<ValidationKey, readonly string[]>>;

type Valued = keyof typeof MESSAGE_VALUES;
type ValuesOf<Key extends Valued> = { readonly [Name in (typeof MESSAGE_VALUES)[Key][number]]: number };

/** A field's problem: a validation message, with the numbers it fills in */
export type ValidationIssue =
  | { readonly key: Exclude<ValidationKey, Valued> }
  | { [Key in Valued]: { readonly key: Key; readonly values: ValuesOf<Key> } }[Valued];

export type Validated<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly fieldErrors: FieldErrors };

const KEYS: ReadonlySet<string> = new Set([...ANY_FIELD_MESSAGES, ...Object.values(RULE_MESSAGES).flat()]);

function isValidationKey(message: string): message is ValidationKey {
  return KEYS.has(message);
}

function isValued(key: ValidationKey): key is Valued {
  return Object.hasOwn(MESSAGE_VALUES, key);
}

/** Raises an issue against the value a check runs on, or against one of its fields */
export function addIssue(
  payload: z.core.ParsePayload,
  issue: ValidationIssue,
  path: readonly PropertyKey[] = [],
): void {
  payload.issues.push({
    code: "custom",
    message: issue.key,
    input: payload.value,
    path: [...path],
    ...("values" in issue ? { params: { values: issue.values } } : {}),
  });
}

// Zod's own issues carry no message key: a value that is missing or empty, or one that is malformed
const genericMessage: z.core.$ZodErrorMap = (issue) =>
  issue.input === undefined || issue.input === null || issue.input === ""
    ? "validation.required"
    : "validation.invalid";

/** The message a form shows for one of the parse's issues */
function issueOf(issue: z.core.$ZodIssue): ValidationIssue {
  // A message that is no validation key, such as a library's own words, is never shown as written
  const key = isValidationKey(issue.message) ? issue.message : "validation.invalid";
  if (!isValued(key)) return { key };
  const values: unknown = issue.code === "custom" ? issue.params?.["values"] : undefined;
  const names = MESSAGE_VALUES[key];
  const given = (name: string) =>
    typeof values === "object" &&
    values !== null &&
    typeof Object.getOwnPropertyDescriptor(values, name)?.value === "number";
  if (!names.every(given)) throw new Error(`${key} was raised without its values: ${names.join(", ")}`);
  // Checked name by name above
  return { key, values } as ValidationIssue;
}

/** The input parsed by the schema, or each field's problems, keyed by its dotted path */
export function validate<Schema extends z.ZodType>(schema: Schema, input: unknown): Validated<z.output<Schema>> {
  const result = schema.safeParse(input, { error: genericMessage });
  if (result.success) return { ok: true, data: result.data };
  // A map, so a field named like an inherited member, such as constructor, is keyed as any other
  const fieldErrors = new Map<string, ValidationIssue[]>();
  for (const issue of result.error.issues) {
    const field = issue.path.map(String).join(".");
    const shown = issueOf(issue);
    const issues = fieldErrors.get(field) ?? [];
    if (!issues.some((other) => other.key === shown.key)) issues.push(shown);
    fieldErrors.set(field, issues);
  }
  return { ok: false, fieldErrors: Object.fromEntries(fieldErrors) };
}
