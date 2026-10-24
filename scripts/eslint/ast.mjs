// The parts of a file's syntax tree that more than one of the project's rules reads: the text of a
// string, the values a choice can take, and the style objects in a JSX style attribute or typed as
// React's CSSProperties.

/** The static text of a string literal or a template literal's parts */
export function textsOf(node) {
  if (node.type === "Literal" && typeof node.value === "string") return [node.value];
  if (node.type === "TemplateLiteral") return node.quasis.map((quasi) => quasi.value.cooked ?? "");
  return [];
}

/** The expression under any `as` or `satisfies` */
export function unwrap(node) {
  return node.type === "TSAsExpression" || node.type === "TSSatisfiesExpression" ? unwrap(node.expression) : node;
}

/** The values an expression can take: each branch of a choice, under any `as` or `satisfies` */
export function branchesOf(node) {
  const value = unwrap(node);
  if (value.type === "ConditionalExpression") return [...branchesOf(value.consequent), ...branchesOf(value.alternate)];
  if (value.type === "LogicalExpression") return [...branchesOf(value.left), ...branchesOf(value.right)];
  return [value];
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
export function isStyleObject(node) {
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
export function nameOf(property) {
  if (property.computed) return null;
  if (property.key.type === "Identifier") return property.key.name;
  return property.key.type === "Literal" && typeof property.key.value === "string" ? property.key.value : null;
}
