import { RAW_TEXT_ELEMENTS, VOID_ELEMENTS } from "./constants";
import { escapeAttribute, escapeText } from "./entities";
import { DomComment, DomDoctype, DomElement, type DomNode, DomParentNode, DomText } from "./nodes";

const serializeText = (node: DomText): string => {
  const parent = node.parent;
  if (parent instanceof DomElement && parent.namespace === "html" && RAW_TEXT_ELEMENTS.has(parent.name)) {
    return node.data;
  }
  return escapeText(node.data);
};

const serializeElement = (element: DomElement): string => {
  let html = `<${element.name}`;
  for (const [name, value] of element.attributes) {
    html += ` ${name}="${escapeAttribute(value)}"`;
  }
  html += ">";

  if (element.namespace === "html" && VOID_ELEMENTS.has(element.name)) {
    return html;
  }

  return `${html}${serializeChildren(element)}</${element.name}>`;
};

/**
 * Serialize a node (outer HTML)
 */
export const serializeNode = (node: DomNode): string => {
  if (node instanceof DomElement) {
    return serializeElement(node);
  }
  if (node instanceof DomText) {
    return serializeText(node);
  }
  if (node instanceof DomComment) {
    return `<!--${node.data}-->`;
  }
  if (node instanceof DomDoctype) {
    return `<!DOCTYPE ${node.name}>`;
  }
  return serializeChildren(node as DomParentNode);
};

/**
 * Serialize the children of a node (inner HTML)
 */
export const serializeChildren = (node: DomNode): string => {
  if (!(node instanceof DomParentNode)) {
    return "";
  }

  let html = "";
  for (const child of node.children) {
    html += serializeNode(child);
  }
  return html;
};
