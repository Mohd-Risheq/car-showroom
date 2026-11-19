import { branchesOf, isStyleObject, nameOf, textsOf, unwrap } from "./ast.mjs";

// Flags design values written into code instead of taken from the tokens (T-13's Done when, D-038):
// src/styles/tokens.css holds every colour, length, time and curve, and components reach them
// through the Tailwind theme (bg-surface-1, p-page, duration-(--dur-modal)) or var(). It checks:
// - Tailwind arbitrary values, properties and variants in any string: w-[37px], [color:#fff],
//   max-[600px]:flex;
// - line heights on the spacing scale in any string (leading-6), which bypass the type steps and
//   Arabic's own line heights (NFR-I18N-06);
// - spacing off DESIGN §3.4's 4 px base in any string, a fraction of a step (p-1.5, -mt-0.5) or
//   1 px (gap-px), on any side or axis, physical or logical (pbs-0.5, inset-s-px), while a size may
//   take one, as a line thinner than a step does (h-0.5, w-px, D-047);
// - a scale on Tailwind's own scale in any string (scale-97, hover:scale-105), a motion value the
//   motion tokens hold (scale-(--press-scale)), where 100 is no scale and -scale-x-100 a mirror;
// - the values of a style object, written in a JSX style attribute (in either branch of a choice) or
//   typed as CSSProperties, of any object key that names a custom property ("--bg": "#0b0d10"), and
//   of a custom property set with style.setProperty();
// - colour attributes, such as fill="#fff" or stroke={on ? "#5cc8db" : "#66778e"};
// - what Motion animates, on a motion or m component and MotionConfig, and an element's .animate()
//   (the Web Animations API): the targets and keyframes as a style object's values, and in the
//   timing, a drag's among it, a time other than 0, an easing written out and a spring's physics.
// A raw value is a colour (hex, a colour function or a named colour), a length in an absolute or
// font-relative unit, a time or an easing function. In CSS text, zero, percentages, viewport units
// and unitless numbers are layout or geometry, not design values, and pass, as do values computed at
// run time. In a style object a number is a length (React adds px) or a unitless value such as an
// opacity or a weight, so one other than 0 or 1 is raw, except where it places or counts things
// (zIndex, order, flex, grid lines, aspectRatio). An easing is raw unless it is linear or computed,
// as a token's is. The rule doesn't read style strings. Tested in
// tests/unit/lint/no-raw-style-values.test.ts.

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

/**
 * Padding, margin, gap, space, inset, a position, translate, scroll spacing, border spacing or text
 * indent a fraction of a step or 1 px, on any side or axis, the block's start and end among them:
 * p-1.5, md:-mt-0.5, pbs-0.5, inset-s-px, border-spacing-x-0.5
 */
const OFF_BASE_SPACING =
  /^(?:\S+:)?!?-?(?:p(?:[xytrblse]|b[se])?|m(?:[xytrblse]|b[se])?|gap(?:-[xy])?|space-[xy]|inset(?:-(?:[xyse]|b[se]))?|top|right|bottom|left|start|end|translate(?:-[xyz])?|scroll-[mp](?:[xytrblse]|b[se])?|border-spacing(?:-[xy])?|indent)-(?:\d*\.\d+|px)!?$/;

/**
 * A scale on Tailwind's own scale other than 100, with any variants, axis, sign or importance:
 * scale-97, hover:scale-105, -scale-y-50, scale-110!
 */
const RAW_SCALE = /^(?:\S+:)?!?-?scale-(?:[xyz]-)?(?!100!?$)\d+!?$/;

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

/** Motion's props that take a target, or targets by name */
const MOTION_TARGETS = new Set([
  "initial",
  "animate",
  "exit",
  "whileHover",
  "whileTap",
  "whileFocus",
  "whileDrag",
  "whileInView",
]);

/** Motion's props that take timing: a transition, and a drag's as it is let go */
const MOTION_TIMINGS = new Set(["transition", "dragTransition"]);

/**
 * The timing that is a time, in Motion's seconds (an inertia's timeConstant in milliseconds) or the
 * Web Animations API's milliseconds
 */
const TIMES = new Set([
  "duration",
  "delay",
  "endDelay",
  "repeatDelay",
  "visualDuration",
  "delayChildren",
  "staggerChildren",
  "timeConstant",
]);

/** The timing that is an easing */
const EASINGS = new Set(["easing", "ease"]);

/**
 * A spring's physics, which come from SPRINGS (src/lib/motion-tokens.ts): a transition's, and the
 * bounce of a drag let go past its bounds
 */
const SPRING_NUMBERS = new Set([
  "bounce",
  "stiffness",
  "damping",
  "mass",
  "velocity",
  "restDelta",
  "restSpeed",
  "bounceStiffness",
  "bounceDamping",
]);

/** Whether a JSX attribute is a prop of a Motion component: motion.div, m.div or MotionConfig */
function isMotionProp(attribute) {
  const element = attribute.parent.name;
  if (element.type === "JSXIdentifier") return element.name === "MotionConfig";
  return element.type === "JSXMemberExpression" && ["motion", "m"].includes(element.object.name);
}

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

/** The class names in a string that space things off the 4 px base */
function offBaseSpacings(text) {
  return text.split(/\s+/).filter((token) => OFF_BASE_SPACING.test(token));
}

/** The class names in a string that scale by a number of their own rather than a motion token */
function rawScales(text) {
  return text.split(/\s+/).filter((token) => RAW_SCALE.test(token));
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
      offBase: 'Spacing "{{value}}" is off the 4 px base (DESIGN §3.4): use a whole step, or a token (D-047)',
      scale:
        'Scale "{{value}}" is a motion value: take it from a token in src/styles/tokens.css, as scale-(--press-scale) (D-038)',
    },
  },
  create(context) {
    function report(node, values) {
      for (const { kind, value } of values) context.report({ node, messageId: "raw", data: { kind, value } });
    }

    /**
     * The raw values, the line heights on the spacing scale, the spacing off the base and the scales
     * off the motion tokens in a string of classes
     */
    function checkClasses(node, text) {
      report(node, arbitraryValues(text).flatMap(rawValues));
      for (const value of spacingLeadings(text)) context.report({ node, messageId: "leading", data: { value } });
      for (const value of offBaseSpacings(text)) context.report({ node, messageId: "offBase", data: { value } });
      for (const value of rawScales(text)) context.report({ node, messageId: "scale", data: { value } });
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

    /**
     * An easing: a list of four numbers is a cubic Bézier, and a name or CSS text is raw unless it
     * is linear, the absence of a curve, while one computed, as a token's, passes
     */
    function checkEasing(node) {
      for (const value of branchesOf(node)) {
        if (value.type === "ArrayExpression") {
          context.report({
            node: value,
            messageId: "raw",
            data: { kind: "curve", value: context.sourceCode.getText(value) },
          });
        } else if (value.type === "Literal" && typeof value.value === "string" && value.value !== "linear") {
          context.report({ node: value, messageId: "raw", data: { kind: "curve", value: value.value } });
        } else {
          report(value, textsOf(value).flatMap(rawValues));
        }
      }
    }

    /** A time: a number other than 0, or CSS text with a time in it */
    function checkTime(node) {
      for (const value of branchesOf(node)) {
        if (value.type !== "Literal" || typeof value.value !== "number") {
          report(value, textsOf(value).flatMap(rawValues));
        } else if (value.value !== 0) {
          context.report({ node: value, messageId: "raw", data: { kind: "time", value: String(value.value) } });
        }
      }
    }

    /**
     * A transition or a Web Animations options object, or a number, a duration. An object under a
     * key the timing doesn't list holds one value's own timing, and any other value there counts,
     * bounds or names, as repeat, fill, staggerDirection and an inertia's max do
     */
    function checkTiming(node) {
      const value = unwrap(node);
      if (value.type === "Literal" && typeof value.value === "number") checkTime(value);
      if (value.type !== "ObjectExpression") return;
      for (const property of value.properties) {
        const name = property.type === "Property" ? nameOf(property) : null;
        if (name === null) continue;
        if (TIMES.has(name)) checkTime(property.value);
        else if (EASINGS.has(name)) checkEasing(property.value);
        else if (SPRING_NUMBERS.has(name)) checkStyleValue(property.value, name);
        else if (unwrap(property.value).type === "ObjectExpression") checkTiming(property.value);
      }
    }

    /** A value a target animates to, or each of its keyframes, as a style's */
    function checkFrames(node, name) {
      const value = unwrap(node);
      for (const frame of value.type === "ArrayExpression" ? value.elements : [value]) {
        if (frame) checkStyleValue(frame, name);
      }
    }

    /**
     * A target or keyframes: each value as a style's, a list of them value by value. A keyframe's
     * offset places it, and a target's transitionEnd holds the values it sets as it ends
     */
    function checkTarget(node) {
      for (const value of branchesOf(node)) {
        if (value.type === "ArrayExpression") {
          for (const frame of value.elements) if (frame) checkTarget(frame);
          continue;
        }
        if (value.type !== "ObjectExpression") continue;
        for (const property of value.properties) {
          const name = property.type === "Property" ? nameOf(property) : null;
          if (name === null || name === "offset") continue;
          if (name === "transition") checkTiming(property.value);
          else if (name === "transitionEnd") checkTarget(property.value);
          else if (EASINGS.has(name)) checkEasing(property.value);
          else checkFrames(property.value, name);
        }
      }
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
      // What a Motion component animates and its timing, and a colour attribute on any element
      JSXAttribute(node) {
        const { name, value } = node;
        if (name.type !== "JSXIdentifier" || !value) return;
        if (value.type === "JSXExpressionContainer" && isMotionProp(node)) {
          if (MOTION_TIMINGS.has(name.name)) checkTiming(value.expression);
          if (MOTION_TARGETS.has(name.name)) checkTarget(value.expression);
          if (name.name === "variants") {
            const variants = unwrap(value.expression);
            if (variants.type === "ObjectExpression") {
              for (const variant of variants.properties) if (variant.type === "Property") checkTarget(variant.value);
            }
          }
        }
        // A colour, as written or in braces, in either branch of a choice. A url(#id) reference
        // names a gradient, mask or pattern, not a colour.
        if (!COLOUR_ATTRIBUTES.has(name.name)) return;
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
        if (callee.type !== "MemberExpression" || callee.computed) return;
        // ...and an element's keyframes and timing: element.animate(keyframes, options)
        if (callee.property.name === "animate") {
          if (name) checkTarget(name);
          if (value) checkTiming(value);
          return;
        }
        if (callee.property.name !== "setProperty") return;
        if (name?.type === "Literal" && typeof name.value === "string" && name.value.startsWith("--") && value) {
          checkStyleValue(value, name.value);
        }
      },
    };
  },
};

export default rule;
