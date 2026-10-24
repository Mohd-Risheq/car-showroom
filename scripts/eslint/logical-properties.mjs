import { branchesOf, isStyleObject, nameOf, textsOf } from "./ast.mjs";

// Flags a physical side where DESIGN §3.4 asks for logical properties, so a layout mirrors between
// Arabic and English with no change of code (FR-01). It checks:
// - Tailwind utilities that set a left or right side, in any string, with any variants: ml-4,
//   pr-page, left-0, text-right, float-left, clear-right, border-l, rounded-tr-lg, scroll-ml-4;
// - the same properties as arbitrary properties: [margin-left:auto], [text-align:right];
// - in a style object, written in a JSX style attribute or typed as CSSProperties, the physical
//   properties (marginLeft, left, borderTopRightRadius) and a left or right textAlign, float or clear.
// Tailwind's x-axis shorthands (mx-4, px-4, inset-x-0, border-x) set both sides and pass. A position
// that is physical by nature, such as a pointer's x over a canvas, says so in a disable comment.
// Tested in tests/unit/lint/logical-properties.test.ts.

/** Tailwind utilities that set a physical side, and their logical twins */
const PHYSICAL_UTILITIES = [
  // Not a language tag such as ml-IN or pl-PL
  { pattern: /^-?m[lr]-(?![A-Z]{2}$)/, logical: "ms-* or me-*" },
  { pattern: /^p[lr]-(?![A-Z]{2}$)/, logical: "ps-* or pe-*" },
  // A box centred by a half inset and a translate. Translate doesn't mirror, so start-1/2 alone
  // would put the box off centre in Arabic by its own width. A negative half inset centres nothing,
  // so it takes the next rule's advice.
  {
    pattern: /^(?:left|right)-(?:1\/2|\[50%\])$/,
    logical: "inset-x-0 mx-auto w-fit, or start-1/2 with rtl:translate-x-1/2 beside -translate-x-1/2",
  },
  // Not prose such as left-to-right
  { pattern: /^-?(?:left|right)-(?!to-)/, logical: "start-* or end-*" },
  { pattern: /^text-(?:left|right)$/, logical: "text-start or text-end" },
  { pattern: /^float-(?:left|right)$/, logical: "float-start or float-end" },
  { pattern: /^clear-(?:left|right)$/, logical: "clear-start or clear-end" },
  { pattern: /^border-[lr](?:-|$)/, logical: "border-s or border-e" },
  {
    pattern: /^rounded-(?:[lr]|[tb][lr])(?:-|$)/,
    logical: "rounded-s, rounded-e, rounded-ss, rounded-se, rounded-es or rounded-ee",
  },
  { pattern: /^-?scroll-[mp][lr]-/, logical: "scroll-ms-*, scroll-me-*, scroll-ps-* or scroll-pe-*" },
  // Arbitrary properties
  {
    pattern: /^\[(?:margin|padding|scroll-margin|scroll-padding|border)-(?:left|right)[\w-]*:/,
    logical: "the -inline-start or -inline-end property",
  },
  { pattern: /^\[border-(?:top|bottom)-(?:left|right)-radius:/, logical: "border-start-start-radius and its kin" },
  { pattern: /^\[(?:left|right):/, logical: "inset-inline-start or inset-inline-end" },
  { pattern: /^\[(?:text-align|float|clear):(?:left|right)\]$/, logical: "start or end" },
];

/** Style properties that set a physical side, and their logical twins */
const PHYSICAL_PROPERTIES = [
  {
    pattern: /^(?:margin|padding|scrollMargin|scrollPadding|border)(?:Left|Right)/,
    logical: "the InlineStart or InlineEnd property",
  },
  { pattern: /^border(?:Top|Bottom)(?:Left|Right)Radius$/, logical: "borderStartStartRadius and its kin" },
  { pattern: /^(?:left|right)$/, logical: "insetInlineStart or insetInlineEnd" },
];

/** Style properties whose value can name a physical side */
const SIDE_VALUES = new Set(["textAlign", "float", "clear"]);

/** A class without its variants and its important mark: md:hover:!ml-4 gives ml-4 */
function utilityOf(token) {
  let depth = 0;
  let start = 0;
  // By UTF-16 index, as slice cuts: a bracket, a parenthesis or a colon is never half of a pair
  for (let index = 0; index < token.length; index += 1) {
    const character = token[index];
    if (character === "[" || character === "(") depth += 1;
    else if (character === "]" || character === ")") depth -= 1;
    else if (character === ":" && depth === 0) start = index + 1;
  }
  return token.slice(start).replace(/^!|!$/g, "");
}

/** The physical utilities in a string that may hold classes, each with its logical twin */
function physicalUtilities(text) {
  return text.split(/\s+/).flatMap((token) => {
    const utility = utilityOf(token);
    const match = PHYSICAL_UTILITIES.find(({ pattern }) => pattern.test(utility));
    return match ? [{ value: utility, logical: match.logical }] : [];
  });
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "Disallow physical sides where a logical property mirrors the layout (DESIGN §3.4)" },
    schema: [],
    messages: {
      physical: '"{{value}}" sets a physical side, which doesn\'t mirror in Arabic: use {{logical}} (DESIGN §3.4)',
    },
  },
  create(context) {
    function report(node, found) {
      for (const { value, logical } of found) context.report({ node, messageId: "physical", data: { value, logical } });
    }

    return {
      // Class strings anywhere: in className, cn() and cva() calls, and constants
      Literal(node) {
        if (typeof node.value === "string") report(node, physicalUtilities(node.value));
      },
      TemplateElement(node) {
        report(node, physicalUtilities(node.value.cooked ?? ""));
      },
      ObjectExpression(node) {
        if (!isStyleObject(node)) return;
        for (const property of node.properties) {
          if (property.type !== "Property") continue;
          const name = nameOf(property);
          if (name === null) continue;
          const match = PHYSICAL_PROPERTIES.find(({ pattern }) => pattern.test(name));
          if (match) report(property.key, [{ value: name, logical: match.logical }]);
          if (!SIDE_VALUES.has(name)) continue;
          for (const branch of branchesOf(property.value)) {
            for (const text of textsOf(branch)) {
              if (text === "left" || text === "right")
                report(branch, [{ value: `${name}: ${text}`, logical: "start or end" }]);
            }
          }
        }
      },
    };
  },
};

export default rule;
