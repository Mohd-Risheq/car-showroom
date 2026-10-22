// The rules of pnpm check:i18n (scripts/check-i18n.ts): both catalogs have the same keys
// (NFR-I18N-01), every message parses as ICU, every plural has each form its language needs, which
// for Arabic is all six (NFR-I18N-03), every copy deck key is in both catalogs (DESIGN §9.2 and
// §9.3), and no message keeps one of the deck's note markers.
import { IntlMessageFormat } from "intl-messageformat";

export type Locale = "en" | "ar";
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
    return error instanceof Error ? error.message : String(error);
  }
}

// Plural forms in CLDR's order
const PLURAL_FORMS: Intl.LDMLPluralRule[] = ["zero", "one", "two", "few", "many", "other"];

/** Each plural in the elements, nested ones too, that lacks a form its language needs */
function pluralGaps(elements: MessageElement[], locale: Locale): Array<{ argument: string; missing: string[] }> {
  return elements.flatMap((element) => {
    if ("children" in element) return pluralGaps(element.children, locale);
    if (!("options" in element)) return [];
    const nested = Object.values(element.options).flatMap((option) => pluralGaps(option.value, locale));
    if (!("pluralType" in element)) return nested;
    const needed = new Intl.PluralRules(locale, { type: element.pluralType }).resolvedOptions().pluralCategories;
    const missing = PLURAL_FORMS.filter((form) => needed.includes(form) && !(form in element.options));
    return missing.length > 0 ? [{ argument: element.value, missing }, ...nested] : nested;
  });
}

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
      for (const { argument, missing } of pluralGaps(elements, locale)) {
        problems.push(`${file}: ${key}: the plural of {${argument}} has no ${list(missing)} form (NFR-I18N-03)`);
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

/** Every rule of check:i18n over the two catalogs and the deck's keys */
export function catalogProblems(catalogs: [Catalog, Catalog], deckKeys: string[]): string[] {
  const [first, second] = catalogs;
  const problems = [...missingKeys(first, second), ...missingKeys(second, first)];
  for (const catalog of catalogs) problems.push(...messageProblems(catalog));
  for (const key of deckKeys) {
    for (const { file, messages, namespaces } of catalogs) {
      if (messages.has(key)) continue;
      problems.push(
        namespaces.has(key)
          ? `${file}: ${key}: a deck key, but here it holds other keys, and a key can't be both (rename it in the deck, T-14)`
          : `${file}: ${key}: in the copy deck (DESIGN §9.2 and §9.3) but missing here`,
      );
    }
  }
  return problems;
}
