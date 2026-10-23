// Flags design values written into code instead of taken from the tokens (T-13's Done when, D-038):
// src/styles/tokens.css holds every colour, length, time and curve, and components reach them
// through the Tailwind theme (bg-surface-1, p-page, duration-(--dur-modal)) or var(). It checks:
// - Tailwind arbitrary values, properties and variants in any string: w-[37px], [color:#fff],
//   max-[600px]:flex;
// - line heights on the spacing scale in any string (leading-6), which bypass the type steps and
//   Arabic's own line heights (NFR-I18N-06);
// - the values of a style object, written in a JSX style attribute (in either branch of a choice) or
//   typed as CSSProperties, of any object key that names a custom property ("--bg": "#0b0d10"), and
//   of a custom property set with style.setProperty();
// - colour attributes, such as fill="#fff" or stroke={on ? "#5cc8db" : "#66778e"}.
// A raw value is a colour (hex, a colour function or a named colour), a length in an absolute or
// font-relative unit, a time or an easing function. In CSS text, zero, percentages, viewport units
// and unitless numbers are layout or geometry, not design values, and pass, as do values computed at
// run time. In a style object a number is a length (React adds px) or a unitless value such as an
// opacity or a weight, so one other than 0 or 1 is raw, except where it places or counts things
// (zIndex, order, flex, grid lines, aspectRatio). The rule doesn't read Motion's animation props,
// Web Animations options or style strings. Tested in tests/unit/lint/no-raw-style-values.test.ts.

/** CSS's named colours (CSS Color 4) */
const NAMED_COLOURS = `
  aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood
  cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod
  darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon
  darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray
  dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green
  greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon
  lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon
  lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen
  magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue
  mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy
  oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip
  peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown
  seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal
  thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen
`
  .trim()
  .split(/\s+/);

/** Each kind of raw value, as it appears in CSS text */
const RAW = [
  { kind: "colour", pattern: /#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{3,4})(?![\w-])/gi },
  { kind: "colour", pattern: /(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^)]*\)?/gi },
  // Not a function of the same name, as tan()
  { kind: "colour", pattern: new RegExp(`(?<![\\w#.-])(?:${NAMED_COLOURS.join("|")})(?![\\w(-])`, "gi") },
  {
    kind: "length",
    pattern: /(?<![\w.#])(\d*\.?\d+)(?:px|r?em|r?ch|r?ex|r?lh|r?cap|r?ic|pt|pc|in|cm|mm|q)(?![\w-])/gi,
  },
  { kind: "time", pattern: /(?<![\w.#])(\d*\.?\d+)m?s(?![\w-])/gi },
  { kind: "curve", pattern: /(?<![\w-])(?:cubic-bezier|steps|linear)\([^)]*\)?/gi },
];

/** A line height on the spacing scale, with any variants: leading-6, md:leading-7 */
const SPACING_LEADING = /^(?:\S+:)?!?leading-\d/;

/** The attributes whose values are colours */
const COLOUR_ATTRIBUTES = new Set(["fill", "stroke", "color", "stopColor", "floodColor", "lightingColor"]);

/** Unitless style properties whose numbers place or count things rather than style them */
const LAYOUT_NUMBERS = new Set([
  "zIndex",
  "order",
  "flex",
  "flexGrow",
  "flexShrink",
  "gridArea",
  "gridRow",
  "gridRowStart",
  "gridRowEnd",
  "gridColumn",
  "gridColumnStart",
  "gridColumnEnd",
  "columnCount",
  "aspectRatio",
  "lineClamp",
  "WebkitLineClamp",
  "orphans",
  "widows",
  "tabSize",
  "animationIterationCount",
]);

/** The raw values in a piece of CSS text: a zero length or time is no design value */
function rawValues(text) {
  return RAW.flatMap(({ kind, pattern }) =>
    Array.from(text.matchAll(pattern))
      .filter(([, number]) => number === undefined || Number(number) !== 0)
      .map(([value]) => ({ kind, value })),
  );
}

/**
 * The CSS text inside the brackets of each Tailwind class in a string: w-[37px] gives "37px". A
 * token with a quoted attribute value is a CSS selector, not a class, and Tailwind writes spaces
 * inside brackets as underscores.
 */
function arbitraryValues(text) {
  return text
    .split(/\s+/)
    .filter((token) => /-\[|^!?\[|\]:/.test(token) && !/=["']/.test(token))
    .flatMap((token) => Array.from(token.matchAll(/\[([^\]]*)\]/g), ([, inside = ""]) => inside.replaceAll("_", " ")));
}

/** The class names in a string that set a line height on the spacing scale */
function spacingLeadings(text) {
  return text.split(/\s+/).filter((token) => SPACING_LEADING.test(token));
}

/** The static text of a string literal or a template literal's parts */
function textsOf(node) {
  if (node.type === "Literal" && typeof node.value === "string") return [node.value];
  if (node.type === "TemplateLiteral") return node.quasis.map((quasi) => quasi.value.cooked ?? "");
  return [];
}

/** The values an expression can take: each branch of a choice, under any `as` or `satisfies` */
function branchesOf(node) {
  const value = unwrap(node);
  if (value.type === "ConditionalExpression") return [...branchesOf(value.consequent), ...branchesOf(value.alternate)];
  if (value.type === "LogicalExpression") return [...branchesOf(value.left), ...branchesOf(value.right)];
  return [value];
}

/** The expression under any `as` or `satisfies` */
function unwrap(node) {
  return node.type === "TSAsExpression" || node.type === "TSSatisfiesExpression" ? unwrap(node.expression) : node;
}

/** Whether a type annotation names React's CSSProperties */
function isCssProperties(type) {
  if (type?.type !== "TSTypeReference") return false;
  const name = type.typeName.type === "TSQualifiedName" ? type.typeName.right : type.typeName;
  return name.type === "Identifier" && name.name === "CSSProperties";
}

/**
 * Whether an object literal is a style: a JSX style attribute's, in either branch of a choice, or
 * one typed as CSSProperties
 */
function isStyleObject(node) {
  let child = node;
  for (let parent = node.parent; parent; child = parent, parent = parent.parent) {
    if (parent.type === "TSAsExpression" || parent.type === "TSSatisfiesExpression") {
      if (isCssProperties(parent.typeAnnotation)) return true;
      continue;
    }
    if ((parent.type === "ConditionalExpression" && parent.test !== child) || parent.type === "LogicalExpression") {
      continue;
    }
    if (parent.type === "VariableDeclarator")
      return parent.init === child && isCssProperties(parent.id.typeAnnotation?.typeAnnotation);
    if (parent.type === "JSXExpressionContainer") {
      const attribute = parent.parent;
      return (
        attribute.type === "JSXAttribute" && attribute.name.type === "JSXIdentifier" && attribute.name.name === "style"
      );
    }
    return false;
  }
  return false;
}

/** The name an object property sets, as written: an identifier or a string */
function nameOf(property) {
  if (property.computed) return null;
  if (property.key.type === "Identifier") return property.key.name;
  return property.key.type === "Literal" && typeof property.key.value === "string" ? property.key.value : null;
}

/** Whether an object property sets a custom property, as "--bg" */
function isCustomProperty(property) {
  return property.key.type === "Literal" && nameOf(property)?.startsWith("--") === true;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow colours, lengths, times and curves written into code instead of taken from the tokens",
    },
    schema: [],
    messages: {
      raw: 'Raw {{kind}} "{{value}}": take it from a token in src/styles/tokens.css, through the Tailwind theme or var() (D-038)',
      number:
        "Raw number {{value}} in a style: take it from a token in src/styles/tokens.css through var(), or from data (D-038)",
      leading:
        'Line height "{{value}}" bypasses the type steps: set the step with a type-* class, which sets Arabic\'s own (NFR-I18N-06)',
    },
  },
  create(context) {
    function report(node, values) {
      for (const { kind, value } of values) context.report({ node, messageId: "raw", data: { kind, value } });
    }

    /** The raw values and the line heights on the spacing scale in a string that may hold classes */
    function checkClasses(node, text) {
      report(node, arbitraryValues(text).flatMap(rawValues));
      for (const value of spacingLeadings(text)) context.report({ node, messageId: "leading", data: { value } });
    }

    /**
     * The value a style property is set to: CSS text is checked, and a number other than 0 or 1 is
     * raw unless the property places or counts things, in either branch of a choice
     */
    function checkStyleValue(node, name) {
      const value = unwrap(node);
      if (value.type === "ConditionalExpression") {
        checkStyleValue(value.consequent, name);
        checkStyleValue(value.alternate, name);
        return;
      }
      if (value.type === "LogicalExpression") {
        checkStyleValue(value.left, name);
        checkStyleValue(value.right, name);
        return;
      }
      const negative = value.type === "UnaryExpression" && value.operator === "-";
      const number = negative ? value.argument : value;
      if (number.type === "Literal" && typeof number.value === "number") {
        if (LAYOUT_NUMBERS.has(name)) return;
        if (negative || (number.value !== 0 && number.value !== 1)) {
          context.report({ node: value, messageId: "number", data: { value: (negative ? -1 : 1) * number.value } });
        }
        return;
      }
      report(value, textsOf(value).flatMap(rawValues));
    }

    return {
      // Class strings anywhere: in className, cn() and cva() calls, and constants
      Literal(node) {
        if (typeof node.value === "string") checkClasses(node, node.value);
      },
      TemplateElement(node) {
        checkClasses(node, node.value.cooked ?? "");
      },
      ObjectExpression(node) {
        if (!isStyleObject(node)) return;
        for (const property of node.properties) {
          // A custom property is checked wherever it is set, below
          if (property.type === "Property" && !property.computed && !isCustomProperty(property)) {
            checkStyleValue(property.value, nameOf(property));
          }
        }
      },
      // A colour attribute, as written or in braces, in either branch of a choice. A url(#id)
      // reference names a gradient, mask or pattern, not a colour.
      JSXAttribute(node) {
        const { name, value } = node;
        if (name.type !== "JSXIdentifier" || !COLOUR_ATTRIBUTES.has(name.name) || !value) return;
        const values = value.type === "JSXExpressionContainer" ? branchesOf(value.expression) : [value];
        for (const branch of values) {
          const texts = textsOf(branch).map((text) => text.replace(/url\(\s*["']?#[^)]*\)/gi, ""));
          report(
            branch,
            texts.flatMap(rawValues).filter(({ kind }) => kind === "colour"),
          );
        }
      },
      // A custom property set from code, in a style object or anywhere else
      Property(node) {
        if (!node.computed && isCustomProperty(node)) checkStyleValue(node.value, nameOf(node));
      },
      // ...or through a style declaration: element.style.setProperty("--x", value)
      CallExpression(node) {
        const {
          callee,
          arguments: [name, value],
        } = node;
        if (callee.type !== "MemberExpression" || callee.computed || callee.property.name !== "setProperty") return;
        if (name?.type === "Literal" && typeof name.value === "string" && name.value.startsWith("--") && value) {
          checkStyleValue(value, name.value);
        }
      },
    };
  },
};

export default rule;
