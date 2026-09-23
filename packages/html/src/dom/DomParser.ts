import {
  CLOSES_PARAGRAPH,
  FOREIGN_BREAKOUT_ELEMENTS,
  HEAD_ELEMENTS,
  HEADING_ELEMENTS,
  RAW_TEXT_ELEMENTS,
  RCDATA_ELEMENTS,
  SCOPE_BOUNDARIES,
  SPECIAL_ELEMENTS,
  SVG_ATTRIBUTE_NAMES,
  SVG_TAG_NAMES,
  TABLE_SCOPE_BOUNDARIES,
  TABLE_SECTIONS,
  VOID_ELEMENTS,
} from "./constants";
import { DomTokenizer, type DomTokenType } from "./DomTokenizer";
import {
  DomComment,
  DomDoctype,
  DomDocument,
  DomElement,
  type DomNamespaceType,
  type DomParentNode,
  DomText,
} from "./nodes";

export type DomParseOptionsType = {
  /**
   * Parse as a fragment: no implicit `<html>`, `<head>` and `<body>` elements are created
   */
  fragment?: boolean;
};

type InsertionModeType = "initial" | "beforeHead" | "inHead" | "afterHead" | "inBody" | "afterBody" | "afterAfterBody";
type StartTagType = Extract<DomTokenType, { type: "startTag" }>;
type EndTagType = Extract<DomTokenType, { type: "endTag" }>;

const TABLE_CONTEXT = new Set(["caption", "colgroup", "tbody", "td", "tfoot", "th", "thead", "tr"]);
const TABLE_ELEMENTS = new Set([...TABLE_CONTEXT, "table"]);
const FORMATTING_ELEMENTS = new Set([
  "a",
  "b",
  "big",
  "code",
  "em",
  "font",
  "i",
  "nobr",
  "s",
  "small",
  "strike",
  "strong",
  "tt",
  "u",
]);
const MARKER_ELEMENTS = new Set(["applet", "caption", "marquee", "object", "td", "template", "th"]);
const NO_RECONSTRUCT = new Set([
  ...CLOSES_PARAGRAPH,
  ...HEAD_ELEMENTS,
  ...TABLE_ELEMENTS,
  "col",
  "iframe",
  "noembed",
  "param",
  "source",
  "textarea",
  "track",
]);

const splitLeadingWhitespace = (data: string): [string, string] => {
  const whitespace = /^[\t\n\f\r ]*/.exec(data)?.[0] ?? "";
  return [whitespace, data.slice(whitespace.length)];
};

const isHtml = (node: DomParentNode | undefined, name: string): boolean =>
  node instanceof DomElement && node.namespace === "html" && node.name === name;

const isIntegrationPoint = (element: DomElement): boolean =>
  element.namespace === "svg"
    ? ["foreignObject", "desc", "title"].includes(element.name)
    : ["mi", "mo", "mn", "ms", "mtext", "annotation-xml"].includes(element.name);

/**
 * Builds a DOM tree from HTML following a simplified version of the HTML5 tree construction algorithm
 */
export class DomParser {
  private readonly document = new DomDocument();
  private readonly tokenizer: DomTokenizer;
  private readonly fragment: boolean;
  private mode: InsertionModeType;
  private stack: DomParentNode[] = [];
  /**
   * List of active formatting elements; `null` entries are scope markers
   */
  private formatting: (DomElement | null)[] = [];
  private html: DomElement | null = null;
  private head: DomElement | null = null;
  private body: DomElement | null = null;
  private skipNewline = false;
  /**
   * Documents without an HTML5 doctype are parsed in quirks mode
   */
  private quirks: boolean;

  constructor(html: string, options: DomParseOptionsType = {}) {
    this.tokenizer = new DomTokenizer(html);
    this.fragment = options.fragment ?? false;
    this.quirks = !this.fragment;
    this.mode = this.fragment ? "inBody" : "initial";

    if (this.fragment) {
      this.stack.push(this.document);
    }
  }

  public parse(): DomDocument {
    let token = this.tokenizer.next();

    while (token) {
      this.process(token);
      token = this.tokenizer.next();
    }

    this.finish();
    return this.document;
  }

  private get current(): DomParentNode {
    return this.stack[this.stack.length - 1] ?? this.document;
  }

  private process(token: DomTokenType): void {
    const skipNewline = this.skipNewline;
    this.skipNewline = false;

    if (skipNewline && token.type === "text" && token.data.startsWith("\n")) {
      if (token.data.length === 1) {
        return;
      }
      token = { type: "text", data: token.data.slice(1) };
    }

    this.dispatch(token);
  }

  private dispatch(token: DomTokenType): void {
    const handlers: Record<InsertionModeType, (token: DomTokenType) => void> = {
      initial: (current) => this.initial(current),
      beforeHead: (current) => this.beforeHead(current),
      inHead: (current) => this.inHead(current),
      afterHead: (current) => this.afterHead(current),
      inBody: (current) => this.inBody(current),
      afterBody: (current) => this.afterBody(current),
      afterAfterBody: (current) => this.afterAfterBody(current),
    };

    handlers[this.mode](token);
  }

  private initial(token: DomTokenType): void {
    if (token.type === "text") {
      const [, rest] = splitLeadingWhitespace(token.data);
      if (!rest) {
        return;
      }
      token = { type: "text", data: rest };
    } else if (token.type === "comment") {
      this.document.appendChild(new DomComment(token.data));
      return;
    } else if (token.type === "doctype") {
      if (!this.document.children.some((child) => child instanceof DomDoctype)) {
        this.document.appendChild(new DomDoctype(token.name));
        this.quirks = token.name !== "html";
      }
      return;
    }

    this.html = this.document.appendChild(new DomElement("html"));
    this.stack = [this.html];
    this.mode = "beforeHead";
    this.dispatch(token);
  }

  private beforeHead(token: DomTokenType): void {
    if (token.type === "text") {
      const [, rest] = splitLeadingWhitespace(token.data);
      if (!rest) {
        return;
      }
      token = { type: "text", data: rest };
    } else if (token.type === "comment") {
      this.insertComment(token.data);
      return;
    } else if (token.type === "doctype") {
      return;
    } else if (token.type === "startTag" && (token.name === "html" || token.name === "head")) {
      if (token.name === "html") {
        this.mergeAttributes(this.html, token.attributes);
      } else {
        this.head = this.insertElement("head", token.attributes);
        this.mode = "inHead";
      }
      return;
    } else if (token.type === "endTag" && !["head", "body", "html", "br"].includes(token.name)) {
      return;
    }

    this.head = this.insertElement("head", []);
    this.mode = "inHead";
    this.dispatch(token);
  }

  private inHead(token: DomTokenType): void {
    if (this.current !== this.head) {
      this.inBody(token);
      return;
    }

    if (token.type === "text") {
      const [whitespace, rest] = splitLeadingWhitespace(token.data);
      if (whitespace) {
        this.insertText(whitespace);
      }
      if (!rest) {
        return;
      }
      token = { type: "text", data: rest };
    } else if (token.type === "comment") {
      this.insertComment(token.data);
      return;
    } else if (token.type === "doctype") {
      return;
    } else if (token.type === "startTag" && (token.name === "html" || token.name === "head")) {
      if (token.name === "html") {
        this.mergeAttributes(this.html, token.attributes);
      }
      return;
    } else if (token.type === "startTag" && HEAD_ELEMENTS.has(token.name)) {
      this.insertHtmlElement(token);
      return;
    } else if (token.type === "endTag" && token.name === "head") {
      this.stack.pop();
      this.mode = "afterHead";
      return;
    } else if (token.type === "endTag" && !["body", "html", "br"].includes(token.name)) {
      return;
    }

    this.stack.pop();
    this.mode = "afterHead";
    this.dispatch(token);
  }

  private afterHead(token: DomTokenType): void {
    if (token.type === "text") {
      const [whitespace, rest] = splitLeadingWhitespace(token.data);
      if (whitespace) {
        this.insertText(whitespace);
      }
      if (!rest) {
        return;
      }
      token = { type: "text", data: rest };
    } else if (token.type === "comment") {
      this.insertComment(token.data);
      return;
    } else if (token.type === "doctype") {
      return;
    } else if (token.type === "startTag" && ["html", "head", "body"].includes(token.name)) {
      if (token.name === "html") {
        this.mergeAttributes(this.html, token.attributes);
      } else if (token.name === "body") {
        this.body = this.insertElement("body", token.attributes);
        this.mode = "inBody";
      }
      return;
    } else if (token.type === "startTag" && HEAD_ELEMENTS.has(token.name) && this.head) {
      this.stack.push(this.head);
      this.mode = "inHead";
      this.dispatch(token);
      return;
    } else if (token.type === "endTag" && !["body", "html", "br"].includes(token.name)) {
      return;
    }

    this.body = this.insertElement("body", []);
    this.mode = "inBody";
    this.dispatch(token);
  }

  private afterBody(token: DomTokenType): void {
    if (token.type === "comment") {
      this.html?.appendChild(new DomComment(token.data));
      return;
    }

    if (token.type === "endTag" && token.name === "html") {
      this.mode = "afterAfterBody";
      return;
    }

    if (this.isIgnorableAfterBody(token)) {
      this.inBody(token);
      return;
    }

    this.mode = "inBody";
    this.dispatch(token);
  }

  private afterAfterBody(token: DomTokenType): void {
    if (token.type === "comment") {
      this.document.appendChild(new DomComment(token.data));
      return;
    }

    if (this.isIgnorableAfterBody(token)) {
      this.inBody(token);
      return;
    }

    this.mode = "inBody";
    this.dispatch(token);
  }

  private isIgnorableAfterBody(token: DomTokenType): boolean {
    return (
      token.type === "doctype" ||
      (token.type === "text" && splitLeadingWhitespace(token.data)[1] === "") ||
      (token.type === "startTag" && token.name === "html")
    );
  }

  private inBody(token: DomTokenType): void {
    switch (token.type) {
      case "text":
        this.reconstructFormatting();
        this.insertText(token.data);
        return;
      case "comment":
        this.insertComment(token.data);
        return;
      case "startTag":
        this.startTagInBody(token);
        return;
      case "endTag":
        this.endTagInBody(token);
        return;
    }
  }

  private startTagInBody(token: StartTagType): void {
    const name = token.name === "image" ? "img" : token.name;

    if (name === "html" || name === "body") {
      if (!this.fragment) {
        this.mergeAttributes(name === "html" ? this.html : this.body, token.attributes);
      }
      return;
    }

    if (name === "head" || name === "frameset") {
      return;
    }

    if (
      (TABLE_CONTEXT.has(name) || name === "col") &&
      this.findInScope(
        (element) => element.name === "table" || element.name === "template",
        [],
        TABLE_SCOPE_BOUNDARIES,
      ) === -1
    ) {
      return;
    }

    if (this.isForeignContext()) {
      const breaksOut =
        FOREIGN_BREAKOUT_ELEMENTS.has(name) ||
        (name === "font" && token.attributes.some(([key]) => ["color", "face", "size"].includes(key)));

      if (!breaksOut) {
        this.insertForeignElement(token, (this.current as DomElement).namespace);
        return;
      }

      while (this.isForeignContext()) {
        this.stack.pop();
      }
    }

    this.closeImpliedElements(name);

    if (!NO_RECONSTRUCT.has(name)) {
      this.reconstructFormatting();
    }

    if (name === "svg" || name === "math") {
      this.insertForeignElement(token, name);
      return;
    }

    this.insertHtmlElement({ ...token, name });
  }

  private endTagInBody(token: EndTagType): void {
    const { name } = token;

    if (this.current instanceof DomElement && this.current.namespace !== "html") {
      for (let i = this.stack.length - 1; i >= 0; i--) {
        const node = this.stack[i];
        if (!(node instanceof DomElement) || node.namespace === "html") {
          break;
        }
        if (node.name.toLowerCase() === name) {
          this.popTo(i);
          return;
        }
      }
    }

    if (name === "body" || name === "html") {
      if (!this.fragment) {
        this.mode = name === "body" ? "afterBody" : "afterAfterBody";
      }
      return;
    }

    if (name === "br") {
      this.startTagInBody({ type: "startTag", name: "br", attributes: [], selfClosing: false });
      return;
    }

    if (name === "p" && this.findInScope("p", ["button"]) === -1) {
      this.current.appendChild(new DomElement("p"));
      return;
    }

    if (HEADING_ELEMENTS.has(name)) {
      this.popTo(this.findInScope((element) => HEADING_ELEMENTS.has(element.name)));
      return;
    }

    if (FORMATTING_ELEMENTS.has(name) && this.adoptionAgency(name)) {
      return;
    }

    if (SPECIAL_ELEMENTS.has(name)) {
      if (TABLE_ELEMENTS.has(name)) {
        this.popTo(this.findInScope(name, [], TABLE_SCOPE_BOUNDARIES));
      } else {
        this.popTo(this.findInScope(name, name === "li" ? ["ol", "ul"] : []));
      }
      return;
    }

    for (let i = this.stack.length - 1; i >= 0; i--) {
      const node = this.stack[i];
      if (!(node instanceof DomElement) || node === this.html || node === this.head || node === this.body) {
        return;
      }

      if (node.name.toLowerCase() === name) {
        this.popTo(i);
        return;
      }

      if (node.namespace === "html" && SPECIAL_ELEMENTS.has(node.name)) {
        return;
      }
    }
  }

  private closeImpliedElements(name: string): void {
    const current = this.current;

    if (CLOSES_PARAGRAPH.has(name) && !(name === "table" && this.quirks)) {
      this.popTo(this.findInScope("p", ["button"]));
    }

    if (HEADING_ELEMENTS.has(name) && current instanceof DomElement && HEADING_ELEMENTS.has(current.name)) {
      this.stack.pop();
    }

    if (name === "li") {
      this.closeListItem(["li"]);
    } else if (name === "dd" || name === "dt") {
      this.closeListItem(["dd", "dt"]);
    } else if (name === "a") {
      const anchor = this.lastFormatting("a");
      if (anchor) {
        this.adoptionAgency("a");
        this.removeFormatting(anchor);
        const index = this.stack.indexOf(anchor);
        if (index !== -1) {
          this.stack.splice(index, 1);
        }
      }
    } else if (name === "nobr") {
      this.reconstructFormatting();
      if (this.findInScope("nobr") !== -1) {
        this.adoptionAgency("nobr");
      }
    } else if (name === "button") {
      this.popTo(this.findInScope(name));
    } else if (name === "option" || name === "optgroup") {
      if (isHtml(this.current, "option")) {
        this.stack.pop();
      }
      if (name === "optgroup" && isHtml(this.current, "optgroup")) {
        this.stack.pop();
      }
    } else if (TABLE_SECTIONS.has(name) || name === "caption" || name === "colgroup") {
      this.clearToTableContext();
    } else if (name === "tr") {
      this.popTo(this.findInScope("tr", [], TABLE_SCOPE_BOUNDARIES));
      if (isHtml(this.current, "table")) {
        this.insertElement("tbody", []);
      }
    } else if (name === "td" || name === "th") {
      this.popTo(
        this.findInScope((element) => element.name === "td" || element.name === "th", [], TABLE_SCOPE_BOUNDARIES),
      );
      if (isHtml(this.current, "table")) {
        this.insertElement("tbody", []);
      }
      const section = this.current;
      if (section instanceof DomElement && TABLE_SECTIONS.has(section.name)) {
        this.insertElement("tr", []);
      }
    } else if (name === "col" && isHtml(this.current, "table")) {
      this.insertElement("colgroup", []);
    }
  }

  private closeListItem(names: string[]): void {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const node = this.stack[i];
      if (!(node instanceof DomElement)) {
        return;
      }

      if (names.includes(node.name)) {
        this.popTo(i);
        return;
      }

      if (SPECIAL_ELEMENTS.has(node.name) && !["address", "div", "p"].includes(node.name)) {
        return;
      }
    }
  }

  private clearToTableContext(): void {
    if (this.findInScope("table", [], TABLE_SCOPE_BOUNDARIES) === -1) {
      return;
    }

    let current = this.current;
    while (current instanceof DomElement && TABLE_CONTEXT.has(current.name)) {
      this.popTo(this.stack.length - 1);
      current = this.current;
    }
  }

  /**
   * HTML5 adoption agency algorithm: repairs misnested formatting elements such as `<b><i></b></i>`.
   * Returns false when the end tag must be handled as "any other end tag".
   */
  private adoptionAgency(subject: string): boolean {
    const current = this.current;
    if (isHtml(current, subject) && !this.formatting.includes(current as DomElement)) {
      this.stack.pop();
      return true;
    }

    for (let outer = 0; outer < 8; outer++) {
      const formattingElement = this.lastFormatting(subject);
      if (!formattingElement) {
        return false;
      }

      const formattingIndex = this.stack.indexOf(formattingElement);
      if (formattingIndex === -1) {
        this.removeFormatting(formattingElement);
        return true;
      }

      if (this.findInScope((element) => element === formattingElement) === -1) {
        return true;
      }

      const furthestBlock = this.stack
        .slice(formattingIndex + 1)
        .find(
          (node): node is DomElement =>
            node instanceof DomElement &&
            (node.namespace === "html" ? SPECIAL_ELEMENTS.has(node.name) : isIntegrationPoint(node)),
        );

      if (!furthestBlock) {
        this.popTo(formattingIndex);
        this.removeFormatting(formattingElement);
        return true;
      }

      const commonAncestor = this.stack[formattingIndex - 1] as DomParentNode;
      let bookmark = this.formatting.indexOf(formattingElement);
      let nodeIndex = this.stack.indexOf(furthestBlock);
      let lastNode: DomElement = furthestBlock;

      for (let inner = 1; ; inner++) {
        nodeIndex--;
        let node = this.stack[nodeIndex] as DomElement;
        if (node === formattingElement) {
          break;
        }

        const listIndex = this.formatting.indexOf(node);
        if (inner > 3 && listIndex !== -1) {
          this.formatting.splice(listIndex, 1);
          if (listIndex < bookmark) {
            bookmark--;
          }
        }

        if (!this.formatting.includes(node)) {
          this.stack.splice(nodeIndex, 1);
          continue;
        }

        const replacement = new DomElement(node.name, node.attributes, node.namespace);
        this.formatting[this.formatting.indexOf(node)] = replacement;
        this.stack[nodeIndex] = replacement;
        node = replacement;

        if (lastNode === furthestBlock) {
          bookmark = this.formatting.indexOf(replacement) + 1;
        }

        node.appendChild(lastNode);
        lastNode = node;
      }

      commonAncestor.appendChild(lastNode);

      const adopted = new DomElement(formattingElement.name, formattingElement.attributes, formattingElement.namespace);
      for (const child of [...furthestBlock.children]) {
        adopted.appendChild(child);
      }
      furthestBlock.appendChild(adopted);

      const oldListIndex = this.formatting.indexOf(formattingElement);
      this.formatting.splice(oldListIndex, 1);
      if (oldListIndex < bookmark) {
        bookmark--;
      }
      this.formatting.splice(bookmark, 0, adopted);

      this.stack.splice(this.stack.indexOf(formattingElement), 1);
      this.stack.splice(this.stack.indexOf(furthestBlock) + 1, 0, adopted);
    }

    return true;
  }

  private lastFormatting(name: string): DomElement | null {
    for (let i = this.formatting.length - 1; i >= 0; i--) {
      const entry = this.formatting[i];
      if (!entry) {
        return null;
      }
      if (entry.name === name) {
        return entry;
      }
    }
    return null;
  }

  private pushFormatting(element: DomElement): void {
    const identical: number[] = [];
    for (let i = this.formatting.length - 1; i >= 0; i--) {
      const entry = this.formatting[i];
      if (!entry) {
        break;
      }
      if (
        entry.name === element.name &&
        entry.attributes.size === element.attributes.size &&
        [...element.attributes].every(([key, value]) => entry.attributes.get(key) === value)
      ) {
        identical.push(i);
      }
    }

    const earliest = identical[2];
    if (earliest !== undefined) {
      this.formatting.splice(earliest, 1);
    }
    this.formatting.push(element);
  }

  private removeFormatting(element: DomElement): void {
    const index = this.formatting.indexOf(element);
    if (index !== -1) {
      this.formatting.splice(index, 1);
    }
  }

  /**
   * Re-open formatting elements that were implicitly closed, e.g. `<p><b>x</p>y` → `y` stays bold
   */
  private reconstructFormatting(): void {
    const list = this.formatting;
    const current = this.current;
    if (
      current instanceof DomElement &&
      current.namespace === "html" &&
      (RAW_TEXT_ELEMENTS.has(current.name) || RCDATA_ELEMENTS.has(current.name))
    ) {
      return;
    }

    let index = list.length - 1;
    const last = list[index];
    if (!last || this.stack.includes(last)) {
      return;
    }

    while (index > 0) {
      const previous = list[index - 1];
      if (!previous || this.stack.includes(previous)) {
        break;
      }
      index--;
    }

    for (; index < list.length; index++) {
      const entry = list[index] as DomElement;
      const element = this.current.appendChild(new DomElement(entry.name, entry.attributes, entry.namespace));
      this.stack.push(element);
      list[index] = element;
    }
  }

  /**
   * Index of the nearest matching open element in scope, or -1 when a scope boundary is hit first
   */
  private findInScope(
    target: string | ((element: DomElement) => boolean),
    extraBoundaries: string[] = [],
    boundaries: Set<string> = SCOPE_BOUNDARIES,
  ): number {
    const matches = typeof target === "string" ? (element: DomElement) => element.name === target : target;

    for (let i = this.stack.length - 1; i >= 0; i--) {
      const node = this.stack[i];
      if (!(node instanceof DomElement)) {
        return -1;
      }

      if (node.namespace === "html" && matches(node)) {
        return i;
      }

      if (boundaries.has(node.name) || extraBoundaries.includes(node.name)) {
        return -1;
      }
    }

    return -1;
  }

  private popTo(index: number): void {
    if (index === -1) {
      return;
    }

    for (const node of this.stack.splice(index)) {
      if (node instanceof DomElement && node.namespace === "html" && MARKER_ELEMENTS.has(node.name)) {
        let entry = this.formatting.pop();
        while (entry) {
          entry = this.formatting.pop();
        }
      }
    }
  }

  private isForeignContext(): boolean {
    const current = this.current;
    return current instanceof DomElement && current.namespace !== "html" && !isIntegrationPoint(current);
  }

  private insertElement(name: string, attributes: [string, string][]): DomElement {
    const element = this.current.appendChild(new DomElement(name, attributes));
    this.stack.push(element);
    return element;
  }

  private insertHtmlElement(token: StartTagType): void {
    const { name } = token;
    const element = this.current.appendChild(new DomElement(name, token.attributes));

    if (VOID_ELEMENTS.has(name)) {
      return;
    }

    this.stack.push(element);

    if (FORMATTING_ELEMENTS.has(name)) {
      this.pushFormatting(element);
    } else if (MARKER_ELEMENTS.has(name)) {
      this.formatting.push(null);
    }

    if (RAW_TEXT_ELEMENTS.has(name)) {
      this.tokenizer.setTextMode(name === "plaintext" ? "plaintext" : "rawtext", name);
    } else if (RCDATA_ELEMENTS.has(name)) {
      this.tokenizer.setTextMode("rcdata", name);
    }

    if (name === "pre" || name === "listing" || name === "textarea") {
      this.skipNewline = true;
    }
  }

  private insertForeignElement(token: StartTagType, namespace: DomNamespaceType): void {
    const isSvg = namespace === "svg";
    const name = isSvg ? (SVG_TAG_NAMES.get(token.name) ?? token.name) : token.name;
    const attributes = token.attributes.map(([key, value]): [string, string] => {
      if (isSvg) {
        return [SVG_ATTRIBUTE_NAMES.get(key) ?? key, value];
      }
      return [key === "definitionurl" ? "definitionURL" : key, value];
    });

    const element = this.current.appendChild(new DomElement(name, attributes, namespace));
    if (!token.selfClosing) {
      this.stack.push(element);
    }
  }

  private insertText(data: string): void {
    const current = this.current;
    const last = current.children[current.children.length - 1];

    if (last instanceof DomText) {
      last.data += data;
    } else {
      current.appendChild(new DomText(data));
    }
  }

  private insertComment(data: string): void {
    this.current.appendChild(new DomComment(data));
  }

  private mergeAttributes(element: DomElement | null, attributes: [string, string][]): void {
    for (const [key, value] of attributes) {
      if (element && !element.attributes.has(key)) {
        element.attributes.set(key, value);
      }
    }
  }

  private finish(): void {
    if (this.fragment) {
      return;
    }

    this.html ??= this.document.appendChild(new DomElement("html"));
    this.head ??= this.html.appendChild(new DomElement("head"));
    this.body ??= this.html.appendChild(new DomElement("body"));
  }
}

export const parseHtml = (html: string, options?: DomParseOptionsType): DomDocument =>
  new DomParser(html, options).parse();
