import { textsOf } from "./ast.mjs";

// Flags an arrow or a caret that points along the line, left or right, drawn without the class that
// mirrors it in Arabic (FR-01.7, DESIGN §3.6). It reads the icons a file imports from Phosphor,
// under any local name or through a namespace, and checks each element JSX draws of one for
// rtl:-scale-x-100 among the strings of its className, as written or inside cn(). Media and brand
// glyphs, and arrows that point up, down or both ways, don't mirror and pass. A glyph whose
// direction is physical, such as the 360° spin's drag (BR-17), says so in a disable comment.
//
// The mirror is a scale, which the browser applies before a rotate or a translate. So on a
// mirrored glyph, a rotate-* or translate-x-* needs its rtl: counterpart, such as rotate-90 with
// rtl:-rotate-90, and a scale-* replaces the mirror, so it goes on a wrapper.
// Tested in tests/unit/lint/mirror-directional-icons.test.ts.

/** Any of Phosphor's entries, though only /ssr may be imported (eslint.config.mjs) */
const PHOSPHOR = /^@phosphor-icons\/react(?:\/|$)/;
/**
 * An arrow or a caret to the left or right, with or without Phosphor's Icon suffix, but not
 * ArrowsLeftRight; and the glyphs whose arrow points along the line: sign in, sign out and send
 */
const DIRECTIONAL = /^(?:(?!\w*LeftRight)(?:Arrow|Caret)\w*(?:Left|Right)\w*|SignIn|SignOut|PaperPlaneRight)(?:Icon)?$/;
const MIRROR = "rtl:-scale-x-100";

/** The static strings anywhere in an expression, such as the arguments of a cn() call */
function stringsIn(node) {
  if (typeof node?.type !== "string") return [];
  const own = textsOf(node);
  if (own.length > 0) return own;
  return Object.entries(node).flatMap(([key, child]) => {
    if (key === "parent") return [];
    return Array.isArray(child) ? child.flatMap(stringsIn) : stringsIn(child);
  });
}

/** Whether an element's className holds the mirroring class, as a class of its own */
function mirrors(element) {
  const className = element.attributes.find(
    (attribute) => attribute.type === "JSXAttribute" && attribute.name.name === "className",
  );
  return stringsIn(className?.value).some((text) => text.split(/\s+/).includes(MIRROR));
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "Require arrows and carets along the line to mirror in RTL (FR-01.7, DESIGN §3.6)" },
    schema: [],
    messages: {
      unmirrored:
        "{{icon}} points along the line, so it mirrors in Arabic: add rtl:-scale-x-100, with an rtl: counterpart for any rotate-* or translate-x-* (FR-01.7, DESIGN §3.6)",
    },
  },
  create(context) {
    // Local names of the directional icons this file imports, and of its Phosphor namespaces
    const directional = new Set();
    const namespaces = new Set();

    /** The icon an element draws, if it is a directional one: ArrowRightIcon, or Icons.ArrowRightIcon */
    function directionalIcon(name) {
      if (name.type === "JSXIdentifier") return directional.has(name.name) ? name.name : null;
      const drawsFromNamespace =
        name.type === "JSXMemberExpression" &&
        name.object.type === "JSXIdentifier" &&
        namespaces.has(name.object.name) &&
        DIRECTIONAL.test(name.property.name);
      return drawsFromNamespace ? `${name.object.name}.${name.property.name}` : null;
    }

    return {
      ImportDeclaration(node) {
        if (!PHOSPHOR.test(node.source.value)) return;
        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportNamespaceSpecifier") namespaces.add(specifier.local.name);
          if (specifier.type !== "ImportSpecifier") continue;
          const imported =
            specifier.imported.type === "Identifier" ? specifier.imported.name : specifier.imported.value;
          if (DIRECTIONAL.test(imported)) directional.add(specifier.local.name);
        }
      },
      JSXOpeningElement(node) {
        const icon = directionalIcon(node.name);
        if (icon === null || mirrors(node)) return;
        context.report({ node, messageId: "unmirrored", data: { icon } });
      },
    };
  },
};

export default rule;
