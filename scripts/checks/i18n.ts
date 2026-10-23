// The rules of pnpm check:i18n (scripts/check-i18n.ts): both catalogs have the same keys
// (NFR-I18N-01); every message parses as ICU and keeps none of its syntax as text; every plural has
// each form its language needs, which for Arabic is all six, and none it never selects
// (NFR-I18N-03); a number English counts with a plural, Arabic counts with one too; a number a
// plural counts, or the other language formats, never prints as plain text, which ICU doesn't group
// (BR-02); a message prints the same placeholders and tags in both languages; every copy deck key
// is in both catalogs (DESIGN §9.2 and §9.3); and no message keeps one of the deck's note markers.
import { IntlMessageFormat } from "intl-messageformat";
import type { LOCALES } from "../../src/lib/i18n/locales.ts";
import { errorMessage } from "./files.ts";

export type Locale = (typeof LOCALES)[number];
type MessageElement = ReturnType<IntlMessageFormat["getAst"]>[number];

/** A catalog's messages by their full keys, nested objects giving dotted keys as next-intl reads them */
export type Catalog = { file: string; locale: Locale; messages: Map<string, string>; namespaces: Set<string> };

/** A catalog read from its JSON, with a problem for each value that isn't a message or a group of them */
export function readCatalog(file: string, locale: Locale, json: unknown): { catalog: Catalog; problems: string[] } {
  const catalog: Catalog = { file, locale, messages: new Map(), namespaces: new Set() };
  const problems: string[] = [];
  const walk = (value: unknown, key: string) => {
    if (typeof value === "string") {
      catalog.messages.set(key, value);
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      if (key) catalog.namespaces.add(key);
      for (const [name, child] of Object.entries(value)) {
        if (name.includes("."))
          problems.push(
            `${file}: ${key ? `${key}.` : ""}${name}: next-intl nests keys by dot, so a key can't hold one`,
          );
        else walk(child, key ? `${key}.${name}` : name);
      }
    } else {
      problems.push(`${file}: ${key || "(the whole file)"}: a message must be text, not ${JSON.stringify(value)}`);
    }
  };
  walk(json, "");
  return { catalog, problems };
}

/** The ICU elements of a message, or the parser's error code */
function parse(message: string, locale: Locale): MessageElement[] | string {
  try {
    return new IntlMessageFormat(message, locale).getAst();
  } catch (error) {
    return errorMessage(error);
  }
}

// Plural forms in CLDR's order
const PLURAL_FORMS: Intl.LDMLPluralRule[] = ["zero", "one", "two", "few", "many", "other"];
const LANGUAGE: Record<Locale, string> = { en: "English", ar: "Arabic" };

type PluralForms = { argument: string; missing: string[]; unused: string[] };

/**
 * Each plural in the elements, nested ones too, that lacks a form its language needs or has one the
 * language never selects. An exact value such as =0 is neither.
 */
function pluralGaps(elements: MessageElement[], locale: Locale): PluralForms[] {
  return elements.flatMap((element) => {
    if ("children" in element) return pluralGaps(element.children, locale);
    if (!("options" in element)) return [];
    const nested = Object.values(element.options).flatMap((option) => pluralGaps(option.value, locale));
    if (!("pluralType" in element)) return nested;
    const needed = new Set<string>(
      new Intl.PluralRules(locale, { type: element.pluralType }).resolvedOptions().pluralCategories,
    );
    const missing = PLURAL_FORMS.filter((form) => needed.has(form) && !(form in element.options));
    const unused = Object.keys(element.options).filter((form) => !form.startsWith("=") && !needed.has(form));
    return missing.length > 0 || unused.length > 0 ? [{ argument: element.value, missing, unused }, ...nested] : nested;
  });
}

// The parser's element types (TYPE in @formatjs/icu-messageformat-parser) that carry no name: text,
// and a plural's #, which prints the plural's number
const TEXT = 0;
const POUND = 7;
// A plain {name}, which ICU prints as String(value), so a number comes out without grouping, and
// {name, number}, which formats it with the locale's grouping
const ARGUMENT = 1;
const NUMBER = 2;

// ICU syntax that the parser kept as text, as after an apostrophe, which quotes it: a brace, or a
// self-closing tag, which ICU doesn't have
const SYNTAX_AS_TEXT = /[{}]|<[A-Za-z][\w-]*\s*\/>/;

/** What pick takes from each element, in every branch: a tag's children and each form of a plural or select */
function everyBranch(elements: MessageElement[], pick: (element: MessageElement) => string[]): string[] {
  return elements.flatMap((element) => [
    ...pick(element),
    ...("children" in element ? everyBranch(element.children, pick) : []),
    ...("options" in element
      ? Object.values(element.options).flatMap((option) => everyBranch(option.value, pick))
      : []),
  ]);
}

/** The text of every literal element, in every branch */
const literals = (elements: MessageElement[]) =>
  everyBranch(elements, (element) => (element.type === TEXT ? [element.value] : []));

const list = (words: string[]) =>
  words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1) ?? ""}`;

/** The problems with one catalog's messages on their own */
function messageProblems({ file, locale, messages }: Catalog): string[] {
  const problems: string[] = [];
  for (const [key, message] of messages) {
    const elements = parse(message, locale);
    if (typeof elements === "string") {
      problems.push(`${file}: ${key}: not valid ICU (${elements})`);
    } else {
      for (const { argument, missing, unused } of pluralGaps(elements, locale)) {
        if (missing.length > 0) {
          problems.push(`${file}: ${key}: the plural of {${argument}} has no ${list(missing)} form (NFR-I18N-03)`);
        }
        if (unused.length > 0) {
          problems.push(
            `${file}: ${key}: the plural of {${argument}} has a ${list(unused)} form, which ${LANGUAGE[locale]} never selects (an exact value is written =n)`,
          );
        }
      }
      const kept = literals(elements).filter((text) => SYNTAX_AS_TEXT.test(text));
      if (kept.length > 0) {
        problems.push(`${file}: ${key}: keeps ICU syntax as text, which shows as written: ${kept.join(", ")}`);
      }
    }
    if (message.includes("†")) problems.push(`${file}: ${key}: holds the deck's note marker † (DESIGN §9.2)`);
    if (message.startsWith("(")) {
      problems.push(`${file}: ${key}: starts with "(", as the deck's notes do (DESIGN §9.2)`);
    }
  }
  return problems;
}

/** The keys one catalog has and the other lacks */
function missingKeys(from: Catalog, other: Catalog): string[] {
  return [...from.messages.keys()]
    .filter((key) => !other.messages.has(key))
    .map((key) => `${other.file}: ${key}: missing, though ${from.file} has it (NFR-I18N-01)`);
}

/**
 * The arguments and tags a message prints, and each select's own argument, as {name} and <name>,
 * looking in every branch. A plural prints its number only through #, which the parser reads as text
 * inside a select.
 */
function placeholders(elements: MessageElement[], pluralArgument?: string): string[] {
  return elements.flatMap((element) => {
    if (element.type === TEXT) return [];
    if (element.type === POUND) return pluralArgument === undefined ? [] : [`{${pluralArgument}}`];
    if ("children" in element) return [`<${element.value}>`, ...placeholders(element.children, pluralArgument)];
    if (!("options" in element)) return [`{${element.value}}`];
    const plural = "pluralType" in element ? element.value : undefined;
    const inside = Object.values(element.options).flatMap((option) => placeholders(option.value, plural));
    return plural === undefined ? [`{${element.value}}`, ...inside] : inside;
  });
}

/** The arguments a cardinal plural counts, in every branch */
const counted = (elements: MessageElement[]) =>
  everyBranch(elements, (element) =>
    "pluralType" in element && element.pluralType === "cardinal" ? [element.value] : [],
  );

/** The arguments a message prints as plain text, in every branch */
const plain = (elements: MessageElement[]) =>
  everyBranch(elements, (element) => (element.type === ARGUMENT ? [element.value] : []));

/** The arguments a message formats as numbers, as {name, number}, in every branch */
const formatted = (elements: MessageElement[]) =>
  everyBranch(elements, (element) => (element.type === NUMBER ? [element.value] : []));

type ParsedPair = { key: string; elements: MessageElement[]; counterpart: MessageElement[] };

/** Each message of one catalog that the other holds too, parsed in both */
function parsedPairs(from: Catalog, other: Catalog): ParsedPair[] {
  return [...from.messages].flatMap(([key, message]) => {
    const text = other.messages.get(key);
    // A message missing from the other catalog, or one that doesn't parse, has its own problem
    if (text === undefined) return [];
    const elements = parse(message, from.locale);
    const counterpart = parse(text, other.locale);
    return typeof elements === "string" || typeof counterpart === "string" ? [] : [{ key, elements, counterpart }];
  });
}

/** The placeholders each message of one catalog prints and the same message of the other lacks */
function missingPlaceholders(from: Catalog, other: Catalog): string[] {
  return parsedPairs(from, other).flatMap(({ key, elements, counterpart }) => {
    const present = new Set(placeholders(counterpart));
    const missing = [...new Set(placeholders(elements))].filter((name) => !present.has(name));
    return missing.length > 0 ? [`${other.file}: ${key}: lacks ${list(missing)}, which ${from.file} has`] : [];
  });
}

/**
 * The numbers English counts with a plural that Arabic prints without one. Arabic's forms include
 * English's, so the reverse is fine: "Compare {count, number} cars" counts in Arabic alone.
 */
function uncounted(english: Catalog, arabic: Catalog): string[] {
  return parsedPairs(english, arabic).flatMap(({ key, elements, counterpart }) => {
    const inArabic = new Set(counted(counterpart));
    return [...new Set(counted(elements))]
      .filter((name) => !inArabic.has(name))
      .map(
        (name) =>
          `${arabic.file}: ${key}: {${name}} has no plural, though ${english.file} counts it with one (NFR-I18N-03)`,
      );
  });
}

/** Each number a message prints as plain text, given the numbers and what makes each one */
function plainNumbers(file: string, key: string, elements: MessageElement[], numbers: Map<string, string>): string[] {
  return [...new Set(plain(elements))].flatMap((name) => {
    const why = numbers.get(name);
    return why === undefined
      ? []
      : [
          `${file}: ${key}: prints {${name}}, ${why}, as plain text, which ICU doesn't group: write {${name}, number} (BR-02)`,
        ];
  });
}

/**
 * The numbers a message prints as plain text: in English, any a plural counts in either language,
 * and in Arabic, any its own plural counts, as Arabic without the plural English has is uncounted's
 * problem. In both, any the other language formats as a number.
 */
function ungrouped(english: Catalog, arabic: Catalog): string[] {
  // A plural's count wins over a format, as its fix is the same and its reason the stronger
  const numbers = (counts: string[], there: Catalog, thereElements: MessageElement[]) =>
    new Map([
      ...formatted(thereElements).map((name): [string, string] => [name, `a number ${there.file} formats`]),
      ...counts.map((name): [string, string] => [name, "a number a plural counts"]),
    ]);
  return parsedPairs(english, arabic).flatMap(({ key, elements, counterpart }) => {
    const inArabic = counted(counterpart);
    return [
      ...plainNumbers(english.file, key, elements, numbers([...counted(elements), ...inArabic], arabic, counterpart)),
      ...plainNumbers(arabic.file, key, counterpart, numbers(inArabic, english, elements)),
    ];
  });
}

/** Every rule of check:i18n over the two catalogs and the deck's keys */
export function catalogProblems({ en, ar }: Record<Locale, Catalog>, deckKeys: string[]): string[] {
  const problems = [...missingKeys(en, ar), ...missingKeys(ar, en)];
  for (const catalog of [en, ar]) problems.push(...messageProblems(catalog));
  problems.push(...missingPlaceholders(en, ar), ...missingPlaceholders(ar, en));
  problems.push(...uncounted(en, ar), ...ungrouped(en, ar));
  for (const key of deckKeys) {
    for (const { file, messages, namespaces } of [en, ar]) {
      if (messages.has(key)) continue;
      problems.push(
        namespaces.has(key)
          ? `${file}: ${key}: a deck key, but here it holds other keys, and a key can't be both (rename it in the deck)`
          : `${file}: ${key}: in the copy deck (DESIGN §9.2 and §9.3) but missing here`,
      );
    }
  }
  return problems;
}
