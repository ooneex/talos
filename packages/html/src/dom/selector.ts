import { HtmlException } from "../HtmlException";
import { CASE_INSENSITIVE_ATTRIBUTES, HEADING_ELEMENTS } from "./constants";
import { DomDocument, DomElement, type DomNode, DomParentNode, DomText } from "./nodes";

type CombinatorType = " " | ">" | "+" | "~";
type AttributeOperatorType = "=" | "~=" | "|=" | "^=" | "$=" | "*=" | "!=";
type NthType = { a: number; b: number };

type SimpleSelectorType =
  | { type: "tag"; name: string }
  | { type: "universal" }
  | { type: "scope" }
  | { type: "id"; value: string }
  | { type: "class"; value: string }
  | {
      type: "attribute";
      name: string;
      operator: AttributeOperatorType | null;
      value: string;
      ignoreCase: boolean | null;
    }
  | { type: "pseudo"; name: string; selectors?: SelectorListType; nth?: NthType; text?: string };

type CompoundSelectorType = SimpleSelectorType[];

type ComplexSelectorType = {
  compounds: CompoundSelectorType[];
  /**
   * combinators[i] joins compounds[i] and compounds[i + 1]
   */
  combinators: CombinatorType[];
};

export type SelectorListType = ComplexSelectorType[];

type MatchContextType = { scope: DomNode | null };

const SELECTOR_PSEUDOS = new Set(["not", "is", "matches", "where", "has"]);
const NTH_PSEUDOS = new Set(["nth-child", "nth-last-child", "nth-of-type", "nth-last-of-type"]);
const TEXT_PSEUDOS = new Set(["contains"]);
const INPUT_TYPE_PSEUDOS = new Set(["checkbox", "radio", "file", "password", "image", "reset", "submit"]);
const DYNAMIC_PSEUDOS = new Set(["hover", "active", "focus", "focus-within", "focus-visible", "visited", "target"]);
const SIMPLE_PSEUDOS = new Set([
  ...INPUT_TYPE_PSEUDOS,
  ...DYNAMIC_PSEUDOS,
  "any-link",
  "button",
  "checked",
  "disabled",
  "empty",
  "enabled",
  "first-child",
  "first-of-type",
  "header",
  "input",
  "last-child",
  "last-of-type",
  "link",
  "only-child",
  "only-of-type",
  "optional",
  "parent",
  "required",
  "root",
  "scope",
  "selected",
  "text",
]);
const FORM_ELEMENTS = new Set(["button", "fieldset", "input", "optgroup", "option", "select", "textarea"]);
const REQUIRABLE_ELEMENTS = new Set(["input", "select", "textarea"]);

const IDENT_CHAR = /[a-zA-Z0-9_-]/;
const HEX = /^[0-9a-fA-F]{1,6}/;
const WHITESPACE = /[\t\n\f\r ]/;

const invalid = (selector: string, reason: string): HtmlException =>
  new HtmlException(`Invalid selector "${selector}": ${reason}`, "HTML_SELECTOR_INVALID", { selector, reason });

class SelectorParser {
  private readonly input: string;
  private position = 0;

  constructor(input: string) {
    this.input = input;
  }

  public parse(relative: boolean): SelectorListType {
    const list = this.parseList(relative);
    if (this.position < this.input.length) {
      throw this.error(`unexpected "${this.input[this.position]}"`);
    }
    return list;
  }

  private parseList(relative: boolean): SelectorListType {
    const list: SelectorListType = [];

    do {
      this.skipWhitespace();
      list.push(this.parseComplex(relative));
      this.skipWhitespace();
    } while (this.consume(","));

    return list;
  }

  private parseComplex(relative: boolean): ComplexSelectorType {
    const compounds: CompoundSelectorType[] = [];
    const combinators: CombinatorType[] = [];
    const leading = this.readCombinator();

    if (leading && !relative) {
      throw this.error(`unexpected combinator "${leading}"`);
    }

    this.skipWhitespace();
    compounds.push(this.parseCompound());

    while (true) {
      const hadWhitespace = this.skipWhitespace();
      const next = this.input[this.position];
      const combinator =
        this.readCombinator() ?? (hadWhitespace && next !== undefined && next !== "," && next !== ")" ? " " : null);

      if (!combinator) {
        break;
      }

      this.skipWhitespace();
      combinators.push(combinator);
      compounds.push(this.parseCompound());
    }

    const startsWithScope = compounds[0]?.some((part) => part.type === "pseudo" && part.name === "scope");
    if (relative && (leading || !startsWithScope)) {
      compounds.unshift([{ type: "scope" }]);
      combinators.unshift(leading ?? " ");
    }

    return { compounds, combinators };
  }

  private parseCompound(): CompoundSelectorType {
    const compound: CompoundSelectorType = [];

    while (this.position < this.input.length) {
      const char = this.input[this.position] as string;

      if (compound.length === 0 && char === "*") {
        this.position++;
        compound.push({ type: "universal" });
      } else if (compound.length === 0 && this.isIdentStart(char)) {
        compound.push({ type: "tag", name: this.readIdentifier().toLowerCase() });
      } else if (char === "#") {
        this.position++;
        compound.push({ type: "id", value: this.readIdentifier() });
      } else if (char === ".") {
        this.position++;
        compound.push({ type: "class", value: this.readIdentifier() });
      } else if (char === "[") {
        compound.push(this.parseAttribute());
      } else if (char === ":") {
        compound.push(this.parsePseudo());
      } else {
        break;
      }
    }

    if (compound.length === 0) {
      throw this.error(
        this.position < this.input.length ? `unexpected "${this.input[this.position]}"` : "empty selector",
      );
    }

    return compound;
  }

  private parseAttribute(): SimpleSelectorType {
    this.position++;
    this.skipWhitespace();
    const name = this.readIdentifier().toLowerCase();
    this.skipWhitespace();

    if (this.consume("]")) {
      return { type: "attribute", name, operator: null, value: "", ignoreCase: null };
    }

    const operator = /^[~|^$*!]?=/.exec(this.input.slice(this.position))?.[0] as AttributeOperatorType | undefined;
    if (!operator) {
      throw this.error("expected attribute operator");
    }
    this.position += operator.length;
    this.skipWhitespace();

    const quote = this.input[this.position];
    const value = quote === '"' || quote === "'" ? this.readString(quote) : this.readIdentifier();
    this.skipWhitespace();

    let ignoreCase: boolean | null = null;
    const flag = this.input[this.position]?.toLowerCase();
    if (flag === "i" || flag === "s") {
      ignoreCase = flag === "i";
      this.position++;
      this.skipWhitespace();
    }

    this.expect("]");
    return { type: "attribute", name, operator, value, ignoreCase };
  }

  private parsePseudo(): SimpleSelectorType {
    this.position++;
    if (this.input[this.position] === ":") {
      throw this.error("pseudo-elements are not supported");
    }

    const name = this.readIdentifier().toLowerCase();

    if (!this.consume("(")) {
      if (!SIMPLE_PSEUDOS.has(name)) {
        throw this.error(`unknown pseudo-class ":${name}"`);
      }
      return { type: "pseudo", name };
    }

    this.skipWhitespace();
    let pseudo: SimpleSelectorType;

    if (SELECTOR_PSEUDOS.has(name)) {
      pseudo = { type: "pseudo", name, selectors: this.parseList(name === "has") };
    } else if (NTH_PSEUDOS.has(name)) {
      pseudo = { type: "pseudo", name, nth: this.parseNth(this.readUntilParenthesis()) };
    } else if (TEXT_PSEUDOS.has(name)) {
      const quote = this.input[this.position];
      const text = quote === '"' || quote === "'" ? this.readString(quote) : this.readUntilParenthesis().trim();
      pseudo = { type: "pseudo", name, text };
    } else {
      throw this.error(`unknown pseudo-class ":${name}()"`);
    }

    this.skipWhitespace();
    this.expect(")");
    return pseudo;
  }

  private parseNth(raw: string): NthType {
    const value = raw.toLowerCase().replace(/[\t\n\f\r ]+/g, "");

    if (value === "odd") {
      return { a: 2, b: 1 };
    }
    if (value === "even") {
      return { a: 2, b: 0 };
    }
    if (/^[+-]?\d+$/.test(value)) {
      return { a: 0, b: Number.parseInt(value, 10) };
    }

    const match = /^([+-]?\d*)n([+-]\d+)?$/.exec(value);
    if (!match) {
      throw this.error(`invalid nth expression "${raw}"`);
    }

    const coefficient = match[1] as string;
    const a =
      coefficient === "" || coefficient === "+" ? 1 : coefficient === "-" ? -1 : Number.parseInt(coefficient, 10);
    return { a, b: match[2] ? Number.parseInt(match[2], 10) : 0 };
  }

  private readIdentifier(): string {
    let result = "";

    while (this.position < this.input.length) {
      const char = this.input[this.position] as string;

      if (IDENT_CHAR.test(char) || char.charCodeAt(0) >= 0x80) {
        result += char;
        this.position++;
      } else if (char === "\\" && this.position + 1 < this.input.length) {
        result += this.readEscape();
      } else {
        break;
      }
    }

    if (!result) {
      throw this.error("expected identifier");
    }

    return result;
  }

  private readEscape(): string {
    this.position++;
    const hex = HEX.exec(this.input.slice(this.position))?.[0];

    if (!hex) {
      return this.input[this.position++] as string;
    }

    this.position += hex.length;
    if (WHITESPACE.test(this.input[this.position] ?? "")) {
      this.position++;
    }

    const codePoint = Number.parseInt(hex, 16);
    return codePoint === 0 || codePoint > 0x10ffff ? "\uFFFD" : String.fromCodePoint(codePoint);
  }

  private readString(quote: string): string {
    this.position++;
    let result = "";

    while (this.position < this.input.length) {
      const char = this.input[this.position] as string;

      if (char === quote) {
        this.position++;
        return result;
      }

      if (char === "\\" && this.position + 1 < this.input.length) {
        if (this.input[this.position + 1] === "\n") {
          this.position += 2;
        } else {
          result += this.readEscape();
        }
      } else {
        result += char;
        this.position++;
      }
    }

    throw this.error("unterminated string");
  }

  private readUntilParenthesis(): string {
    const end = this.input.indexOf(")", this.position);
    const value = this.input.slice(this.position, end === -1 ? undefined : end);
    this.position += value.length;
    return value;
  }

  private readCombinator(): CombinatorType | null {
    const char = this.input[this.position];
    if (char === ">" || char === "+" || char === "~") {
      this.position++;
      return char;
    }
    return null;
  }

  private isIdentStart(char: string): boolean {
    return char === "\\" || /[a-zA-Z_-]/.test(char) || char.charCodeAt(0) >= 0x80;
  }

  private skipWhitespace(): boolean {
    const start = this.position;
    while (WHITESPACE.test(this.input[this.position] ?? "")) {
      this.position++;
    }
    return this.position > start;
  }

  private consume(char: string): boolean {
    if (this.input[this.position] === char) {
      this.position++;
      return true;
    }
    return false;
  }

  private expect(char: string): void {
    if (!this.consume(char)) {
      throw this.error(`expected "${char}"`);
    }
  }

  private error(reason: string): HtmlException {
    return invalid(this.input, reason);
  }
}

const cache = new Map<string, SelectorListType>();
const CACHE_LIMIT = 500;

export const parseSelector = (selector: string, relative = false): SelectorListType => {
  const key = `${relative ? "r" : "a"}:${selector}`;
  let list = cache.get(key);

  if (!list) {
    list = new SelectorParser(selector.trim()).parse(relative);
    if (cache.size >= CACHE_LIMIT) {
      cache.clear();
    }
    cache.set(key, list);
  }

  return list;
};

const nthMatches = (position: number, { a, b }: NthType): boolean => {
  if (a === 0) {
    return position === b;
  }
  const offset = position - b;
  return offset / a >= 0 && offset % a === 0;
};

/**
 * 1-based position of an element among its element siblings (optionally of the same type)
 */
const siblingPosition = (element: DomElement, fromEnd: boolean, sameType: boolean): number => {
  let position = 1;
  let sibling = fromEnd ? element.nextElementSibling : element.previousElementSibling;

  while (sibling) {
    if (!sameType || sibling.name === element.name) {
      position++;
    }
    sibling = fromEnd ? sibling.nextElementSibling : sibling.previousElementSibling;
  }

  return position;
};

const hasContent = (element: DomElement): boolean =>
  element.children.some((child) => child instanceof DomElement || (child instanceof DomText && child.data !== ""));

const inputType = (element: DomElement): string => (element.getAttribute("type") ?? "").toLowerCase();

const matchAttribute = (element: DomElement, selector: Extract<SimpleSelectorType, { type: "attribute" }>): boolean => {
  const actual = element.getAttribute(selector.name);
  const { operator } = selector;

  if (actual === null) {
    return operator === "!=";
  }

  if (operator === null) {
    return true;
  }

  const ignoreCase =
    selector.ignoreCase ?? (element.namespace === "html" && CASE_INSENSITIVE_ATTRIBUTES.has(selector.name));
  const value = ignoreCase ? selector.value.toLowerCase() : selector.value;
  const attribute = ignoreCase ? actual.toLowerCase() : actual;

  switch (operator) {
    case "=":
      return attribute === value;
    case "!=":
      return attribute !== value;
    case "~=":
      return value !== "" && !/[\t\n\f\r ]/.test(value) && attribute.split(/[\t\n\f\r ]+/).includes(value);
    case "|=":
      return attribute === value || attribute.startsWith(`${value}-`);
    case "^=":
      return value !== "" && attribute.startsWith(value);
    case "$=":
      return value !== "" && attribute.endsWith(value);
    default:
      return value !== "" && attribute.includes(value);
  }
};

/**
 * Elements that a relative selector (`:has()` argument or `find()` selector) can reach from its scope
 */
const relativeCandidates = (scope: DomNode, list: SelectorListType): DomElement[] => {
  const candidates = scope instanceof DomParentNode && !isTemplate(scope) ? scope.descendants(false) : [];

  if (list.some((complex) => complex.combinators[0] === "+" || complex.combinators[0] === "~")) {
    for (let sibling = scope.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
      candidates.push(sibling, ...(sibling.isTemplate ? [] : sibling.descendants(false)));
    }
  }

  return candidates;
};

const isTemplate = (node: DomNode): boolean => node instanceof DomElement && node.isTemplate;

/**
 * Parent as seen by selectors: template content is detached from its `<template>` element
 */
const selectorParent = (node: DomNode): DomParentNode | null =>
  node.parent && !isTemplate(node.parent) ? node.parent : null;

const matchPseudo = (
  element: DomElement,
  selector: Extract<SimpleSelectorType, { type: "pseudo" }>,
  context: MatchContextType,
): boolean => {
  const { name, selectors = [], nth = { a: 0, b: 0 }, text = "" } = selector;

  switch (name) {
    case "not":
      return !matchList(element, selectors, context);
    case "is":
    case "matches":
    case "where":
      return matchList(element, selectors, context);
    case "has": {
      const scoped = { scope: element };
      return relativeCandidates(element, selectors).some((candidate) => matchList(candidate, selectors, scoped));
    }
    case "scope":
      return element === context.scope;
    case "first-child":
    case "last-child":
    case "only-child":
      return (
        (name === "last-child" || !element.previousElementSibling) &&
        (name === "first-child" || !element.nextElementSibling)
      );
    case "first-of-type":
    case "last-of-type":
    case "only-of-type":
      return (
        (name === "last-of-type" || siblingPosition(element, false, true) === 1) &&
        (name === "first-of-type" || siblingPosition(element, true, true) === 1)
      );
    case "nth-child":
    case "nth-last-child":
    case "nth-of-type":
    case "nth-last-of-type":
      return nthMatches(siblingPosition(element, name.includes("last"), name.endsWith("of-type")), nth);
    case "contains":
      return element.textContent.includes(text);
    case "empty":
      return !hasContent(element);
    case "parent":
      return hasContent(element);
    case "root":
      return element.parent instanceof DomDocument;
    case "checked":
      return (
        (element.name === "input" &&
          ["checkbox", "radio"].includes(inputType(element)) &&
          element.hasAttribute("checked")) ||
        (element.name === "option" && element.hasAttribute("selected"))
      );
    case "selected":
      return element.name === "option" && element.hasAttribute("selected");
    case "disabled":
    case "enabled":
      return FORM_ELEMENTS.has(element.name) && element.hasAttribute("disabled") === (name === "disabled");
    case "required":
    case "optional":
      return REQUIRABLE_ELEMENTS.has(element.name) && element.hasAttribute("required") === (name === "required");
    case "link":
    case "any-link":
      return ["a", "area", "link"].includes(element.name) && element.hasAttribute("href");
    case "header":
      return HEADING_ELEMENTS.has(element.name);
    case "input":
      return ["button", "input", "select", "textarea"].includes(element.name);
    case "button":
      return element.name === "button" || (element.name === "input" && inputType(element) === "button");
    case "text":
      return element.name === "input" && ["", "text"].includes(inputType(element));
    default:
      return INPUT_TYPE_PSEUDOS.has(name) && inputType(element) === name;
  }
};

const matchSimple = (element: DomElement, selector: SimpleSelectorType, context: MatchContextType): boolean => {
  switch (selector.type) {
    case "tag":
      return element.name.toLowerCase() === selector.name;
    case "universal":
      return true;
    case "scope":
      return element === context.scope;
    case "id":
      return element.getAttribute("id") === selector.value;
    case "class":
      return element.classList.includes(selector.value);
    case "attribute":
      return matchAttribute(element, selector);
    default:
      return matchPseudo(element, selector, context);
  }
};

const matchCompound = (node: DomNode, compound: CompoundSelectorType, context: MatchContextType): boolean => {
  if (!(node instanceof DomElement)) {
    return node === context.scope && compound.every((part) => part.type === "scope");
  }
  return compound.every((part) => matchSimple(node, part, context));
};

const matchComplex = (
  node: DomNode,
  complex: ComplexSelectorType,
  context: MatchContextType,
  index = complex.compounds.length - 1,
): boolean => {
  if (!matchCompound(node, complex.compounds[index] as CompoundSelectorType, context)) {
    return false;
  }

  if (index === 0) {
    return true;
  }

  switch (complex.combinators[index - 1]) {
    case ">": {
      const parent = selectorParent(node);
      return parent !== null && matchComplex(parent, complex, context, index - 1);
    }
    case "+": {
      const previous = node.previousElementSibling;
      return previous !== null && matchComplex(previous, complex, context, index - 1);
    }
    case "~":
      for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
        if (matchComplex(sibling, complex, context, index - 1)) {
          return true;
        }
      }
      return false;
    default:
      for (let ancestor = selectorParent(node); ancestor; ancestor = selectorParent(ancestor)) {
        if (matchComplex(ancestor, complex, context, index - 1)) {
          return true;
        }
      }
      return false;
  }
};

const matchList = (node: DomNode, list: SelectorListType, context: MatchContextType): boolean =>
  list.some((complex) => matchComplex(node, complex, context));

/**
 * Whether an element matches a CSS selector
 */
export const matchesSelector = (element: DomElement, selector: string, scope: DomNode | null = null): boolean =>
  matchList(element, parseSelector(selector), { scope });

const documentOrder = (a: DomNode, b: DomNode): number => {
  const path = (node: DomNode): number[] => {
    const indexes: number[] = [];
    for (let current: DomNode | null = node; current?.parent; current = current.parent) {
      indexes.unshift(current.index);
    }
    return indexes;
  };

  const pathA = path(a);
  const pathB = path(b);
  for (let i = 0; i < Math.min(pathA.length, pathB.length); i++) {
    const diff = (pathA[i] as number) - (pathB[i] as number);
    if (diff !== 0) {
      return diff;
    }
  }
  return pathA.length - pathB.length;
};

/**
 * Find every element matching a selector relative to each root (descendants, or siblings for `+` / `~`),
 * deduplicated and in document order
 */
export const selectAll = (selector: string, roots: DomNode[]): DomElement[] => {
  const list = parseSelector(selector, true);
  const found = new Set<DomElement>();

  for (const root of roots) {
    const context = { scope: root };
    for (const candidate of relativeCandidates(root, list)) {
      if (matchList(candidate, list, context)) {
        found.add(candidate);
      }
    }
  }

  const result = [...found];
  return roots.length > 1 ? result.sort(documentOrder) : result;
};
