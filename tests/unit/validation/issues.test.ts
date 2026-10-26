import { IntlMessageFormat } from "intl-messageformat";
import { describe, expect, it } from "vitest";
import { LOCALES } from "@/lib/i18n/locales";
import { addIssue, MESSAGE_VALUES, validate } from "@/lib/validation/issues";
import { ANY_FIELD_MESSAGES, RULE_MESSAGES } from "@/lib/validation/messages";
import { z } from "@/lib/validation/zod";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";

// A form shows each field's problem as a catalog message, with the numbers it fills in (SRS §7.1,
// D-040). validate() turns a schema's issues into those messages.

type MessageElement = ReturnType<IntlMessageFormat["getAst"]>[number];

// The parser's element types (TYPE in @formatjs/icu-messageformat-parser) whose value is no argument
const LITERAL = 0;
const TAG = 8;

/** The names of a message's ICU arguments, in every branch */
function argumentsOf(elements: MessageElement[]): string[] {
  return elements.flatMap((element) => [
    ...(element.type !== LITERAL && element.type !== TAG && "value" in element ? [element.value] : []),
    ...("children" in element ? argumentsOf(element.children) : []),
    ...("options" in element ? Object.values(element.options).flatMap((option) => argumentsOf(option.value)) : []),
  ]);
}

const KEYS = [...new Set([...ANY_FIELD_MESSAGES, ...Object.values(RULE_MESSAGES).flat()])];

describe("the values of the validation messages", () => {
  it("are the arguments each message prints, in both languages", () => {
    for (const locale of LOCALES) {
      const catalog: Record<string, string> = { ar, en }[locale].validation;
      const printed = Object.fromEntries(
        KEYS.map((key) => {
          const message = catalog[key.slice("validation.".length)] ?? "";
          return [key, [...new Set(argumentsOf(new IntlMessageFormat(message, locale).getAst()))].sort()];
        }),
      );
      const declared = Object.fromEntries(
        KEYS.map((key) => [key, [...((MESSAGE_VALUES as Record<string, readonly string[]>)[key] ?? [])].sort()]),
      );
      expect(printed, locale).toStrictEqual(declared);
    }
  });
});

describe("validate", () => {
  const schema = z.object({
    name: z.string(),
    count: z.number().check((payload) => {
      if (payload.value > 9) addIssue(payload, { key: "validation.range", values: { min: 0, max: 9 } });
    }),
    nested: z.object({ year: z.number() }).optional(),
  });

  it("gives the parsed data", () => {
    expect(validate(schema, { name: "Muftah", count: 3 })).toStrictEqual({
      ok: true,
      data: { name: "Muftah", count: 3 },
    });
  });

  it("names an empty value as required and a malformed one as invalid", () => {
    expect(validate(schema, { count: "three" })).toStrictEqual({
      ok: false,
      fieldErrors: { name: [{ key: "validation.required" }], count: [{ key: "validation.invalid" }] },
    });
    expect(validate(z.object({ fuel: z.enum(["diesel"]) }), { fuel: "" })).toStrictEqual({
      ok: false,
      fieldErrors: { fuel: [{ key: "validation.required" }] },
    });
    expect(validate(z.object({ fuel: z.enum(["diesel"]) }), { fuel: null })).toStrictEqual({
      ok: false,
      fieldErrors: { fuel: [{ key: "validation.required" }] },
    });
  });

  it("passes a rule's values to its message", () => {
    expect(validate(schema, { name: "Muftah", count: 12 })).toStrictEqual({
      ok: false,
      fieldErrors: { count: [{ key: "validation.range", values: { min: 0, max: 9 } }] },
    });
  });

  it("keys a nested field by its dotted path, and the whole input by the empty name", () => {
    expect(validate(schema, { name: "Muftah", count: 1, nested: { year: "soon" } })).toStrictEqual({
      ok: false,
      fieldErrors: { "nested.year": [{ key: "validation.invalid" }] },
    });
    expect(validate(schema, "Muftah")).toStrictEqual({
      ok: false,
      fieldErrors: { "": [{ key: "validation.invalid" }] },
    });
  });

  it("keys a field named like a member every object inherits as it keys any other", () => {
    expect(validate(z.record(z.string(), z.number()), { valueOf: "x", toString: "y" })).toStrictEqual({
      ok: false,
      fieldErrors: { valueOf: [{ key: "validation.invalid" }], toString: [{ key: "validation.invalid" }] },
    });
  });

  it("puts a check's issue at the path it names", () => {
    const pair = z.object({ low: z.number(), high: z.number() }).check((payload) => {
      if (payload.value.low >= payload.value.high) addIssue(payload, { key: "validation.invalid" }, ["high"]);
    });
    expect(validate(pair, { low: 5, high: 2 })).toStrictEqual({
      ok: false,
      fieldErrors: { high: [{ key: "validation.invalid" }] },
    });
  });

  it("shows a message that is not a validation key as invalid, never as written", () => {
    expect(validate(z.object({ name: z.string().min(2, "Too short") }), { name: "M" })).toStrictEqual({
      ok: false,
      fieldErrors: { name: [{ key: "validation.invalid" }] },
    });
  });

  it("shows each message once for a field, and each different message", () => {
    expect(validate(z.object({ name: z.string().min(3).max(1) }), { name: "ab" })).toStrictEqual({
      ok: false,
      fieldErrors: { name: [{ key: "validation.invalid" }] },
    });
    const both = z.string().check((payload) => {
      addIssue(payload, { key: "validation.nameLength" });
      addIssue(payload, { key: "validation.invalid" });
      addIssue(payload, { key: "validation.nameLength" });
    });
    expect(validate(z.object({ name: both }), { name: "M" })).toStrictEqual({
      ok: false,
      fieldErrors: { name: [{ key: "validation.nameLength" }, { key: "validation.invalid" }] },
    });
  });

  it("refuses a valued message without its values, from a check or from Zod's own", () => {
    const broken = z.number().check((payload) => {
      payload.issues.push({ code: "custom", message: "validation.range", input: payload.value });
    });
    expect(() => validate(broken, 1)).toThrow(/validation\.range/);
    expect(() => validate(z.number().max(5, { error: "validation.range" }), 6)).toThrow(/validation\.range/);
  });
});
