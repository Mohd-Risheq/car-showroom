// Flags user-facing text written into components instead of taken from the message catalogs
// (SRS §11.9, DESIGN §9.2): text between JSX tags, string literals rendered as children, and
// string values of the user-facing attributes. Text without a letter (punctuation, symbols,
// digits) and text inside code elements pass, though an attribute on or inside a code element is
// still checked. eslint.config.mjs exempts tests and the development pages. Tested in
// tests/unit/lint/no-hardcoded-copy.test.ts.

const ATTRIBUTES = ["aria-label", "alt", "title", "placeholder"];
const CODE_ELEMENTS = new Set(["code", "pre", "kbd", "samp"]);
const LETTER = /\p{L}/u;
const SHOWN_CHARACTERS = 40;

/**
 * The literals an expression renders: the literal itself, both branches of a conditional, the
 * right side of `&&`, and both sides of `||`, `??` and `+`. Calls are skipped, because their
 * string arguments are catalog keys, not text.
 */
function renderedLiterals(expression) {
  switch (expression.type) {
    case "Literal":
      return typeof expression.value === "string" ? [expression] : [];
    case "TemplateLiteral":
      return [expression];
    case "ConditionalExpression":
      return [...renderedLiterals(expression.consequent), ...renderedLiterals(expression.alternate)];
    case "LogicalExpression":
      // `a && b` shows a only when a is falsy, which no text with a letter is
      return expression.operator === "&&"
        ? renderedLiterals(expression.right)
        : [...renderedLiterals(expression.left), ...renderedLiterals(expression.right)];
    case "BinaryExpression":
      return expression.operator === "+"
        ? [...renderedLiterals(expression.left), ...renderedLiterals(expression.right)]
        : [];
    default:
      return [];
  }
}

/** The static text of a JSXText, Literal or TemplateLiteral node */
function textOf(node) {
  if (node.type === "TemplateLiteral") return node.quasis.map((quasi) => quasi.value.cooked ?? "").join("");
  return String(node.value);
}

/** Whether the node sits inside <code>, <pre>, <kbd> or <samp> */
function insideCode(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    const name = parent.type === "JSXElement" ? parent.openingElement.name : null;
    if (name?.type === "JSXIdentifier" && CODE_ELEMENTS.has(name.name)) return true;
  }
  return false;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "Disallow user-facing text written into components instead of the message catalogs" },
    schema: [
      {
        type: "object",
        properties: { attributes: { type: "array", items: { type: "string" }, uniqueItems: true } },
        additionalProperties: false,
      },
    ],
    messages: {
      text: 'Hard-coded copy "{{text}}": take it from the message catalogs (SRS §11.9)',
      attribute: 'Hard-coded {{attribute}} "{{text}}": take it from the message catalogs (SRS §11.9)',
    },
  },
  create(context) {
    const attributes = new Set(context.options[0]?.attributes ?? ATTRIBUTES);

    function check(node, attribute) {
      const text = textOf(node).trim();
      // Only text is exempt in code: an attribute is shown or read aloud wherever its element is
      if (!LETTER.test(text) || (!attribute && insideCode(node))) return;
      const shown = text.length > SHOWN_CHARACTERS ? `${text.slice(0, SHOWN_CHARACTERS)}…` : text;
      if (attribute) context.report({ node, messageId: "attribute", data: { attribute, text: shown } });
      else context.report({ node, messageId: "text", data: { text: shown } });
    }

    return {
      JSXText(node) {
        check(node);
      },
      JSXExpressionContainer(node) {
        if (node.parent.type !== "JSXElement" && node.parent.type !== "JSXFragment") return;
        for (const literal of renderedLiterals(node.expression)) check(literal);
      },
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier" || !attributes.has(node.name.name) || !node.value) return;
        const { value } = node;
        const literals =
          value.type === "Literal"
            ? [value]
            : value.type === "JSXExpressionContainer"
              ? renderedLiterals(value.expression)
              : [];
        for (const literal of literals) check(literal, node.name.name);
      },
    };
  },
};

export default rule;
