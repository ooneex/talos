import { parseHtml } from "./DomParser";
import { DomElement, type DomNode, DomParentNode, DomText } from "./nodes";
import { matchesSelector, selectAll } from "./selector";
import { serializeChildren } from "./serializer";

export type DomContentType = string | DomNode | DomNode[] | DomSelection;

export type DomFilterType = string | DomNode | DomNode[] | DomSelection | ((index: number, node: DomNode) => boolean);

/**
 * Attributes whose getter returns the attribute name when present, mirroring jQuery / Cheerio
 */
const BOOLEAN_ATTRIBUTES = new Set([
  "async",
  "autofocus",
  "autoplay",
  "checked",
  "controls",
  "defer",
  "disabled",
  "hidden",
  "loop",
  "multiple",
  "open",
  "readonly",
  "required",
  "scoped",
  "selected",
]);

const unique = <T>(nodes: Iterable<T>): T[] => [...new Set(nodes)];

const splitClasses = (names: string): string[] => names.split(/[\t\n\f\r ]+/).filter(Boolean);

const toNodes = (content: DomContentType): DomNode[] => {
  if (typeof content === "string") {
    return [...parseHtml(content, { fragment: true }).children];
  }
  if (content instanceof DomSelection) {
    return content.toArray();
  }
  return Array.isArray(content) ? content : [content];
};

/**
 * A set of DOM nodes with a jQuery-like API for traversal, reading and manipulation
 */
export class DomSelection implements Iterable<DomNode> {
  private readonly nodes: DomNode[];

  constructor(nodes: Iterable<DomNode> = []) {
    this.nodes = [...nodes];
  }

  public get length(): number {
    return this.nodes.length;
  }

  public [Symbol.iterator](): Iterator<DomNode> {
    return this.nodes[Symbol.iterator]();
  }

  public get(): DomNode[];
  public get(index: number): DomNode | undefined;
  public get(index?: number): DomNode[] | DomNode | undefined {
    return index === undefined ? this.toArray() : this.nodes.at(index);
  }

  public toArray(): DomNode[] {
    return [...this.nodes];
  }

  public elements(): DomElement[] {
    return this.nodes.filter((node): node is DomElement => node instanceof DomElement);
  }

  /**
   * Iterate over the nodes; returning `false` stops the iteration
   */
  public each(callback: (index: number, node: DomNode) => unknown): this {
    for (const [index, node] of this.nodes.entries()) {
      if (callback(index, node) === false) {
        break;
      }
    }
    return this;
  }

  /**
   * Map each node to a value; `null` / `undefined` results are skipped and arrays are flattened
   */
  public map<T>(callback: (index: number, node: DomNode) => T | T[] | null | undefined): T[] {
    const result: T[] = [];
    for (const [index, node] of this.nodes.entries()) {
      const value = callback(index, node);
      if (Array.isArray(value)) {
        result.push(...value);
      } else if (value !== null && value !== undefined) {
        result.push(value);
      }
    }
    return result;
  }

  public first(): DomSelection {
    return this.eq(0);
  }

  public last(): DomSelection {
    return this.eq(-1);
  }

  public eq(index: number): DomSelection {
    const node = this.nodes.at(index);
    return new DomSelection(node ? [node] : []);
  }

  public slice(start?: number, end?: number): DomSelection {
    return new DomSelection(this.nodes.slice(start, end));
  }

  public filter(filter: DomFilterType): DomSelection {
    const matches = this.predicate(filter);
    return new DomSelection(this.nodes.filter((node, index) => matches(node, index)));
  }

  public not(filter: DomFilterType): DomSelection {
    const matches = this.predicate(filter);
    return new DomSelection(this.nodes.filter((node, index) => !matches(node, index)));
  }

  public is(filter: DomFilterType): boolean {
    const matches = this.predicate(filter);
    return this.nodes.some((node, index) => matches(node, index));
  }

  /**
   * Keep the elements that contain at least one descendant matching the selector
   */
  public has(selector: string): DomSelection {
    return new DomSelection(this.nodes.filter((node) => selectAll(selector, [node]).length > 0));
  }

  public find(selector: string | DomNode | DomSelection): DomSelection {
    if (typeof selector === "string") {
      return new DomSelection(selectAll(selector, this.nodes));
    }

    const roots = this.nodes;
    return new DomSelection(
      toNodes(selector).filter((node) => {
        for (let parent = node.parent; parent; parent = parent.parent) {
          if (roots.includes(parent)) {
            return true;
          }
        }
        return false;
      }),
    );
  }

  public parent(selector?: string): DomSelection {
    return this.filtered(
      unique(this.nodes.map((node) => node.parentElement).filter((node): node is DomElement => node !== null)),
      selector,
    );
  }

  public parents(selector?: string): DomSelection {
    const ancestors: DomElement[] = [];
    for (const node of this.nodes) {
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        ancestors.push(parent);
      }
    }
    return this.filtered(unique(ancestors), selector);
  }

  /**
   * For each node, the first element matching the selector among itself and its ancestors
   */
  public closest(selector: string): DomSelection {
    const found: DomElement[] = [];
    for (const node of this.nodes) {
      let current: DomElement | null = node instanceof DomElement ? node : node.parentElement;
      while (current && !matchesSelector(current, selector)) {
        current = current.parentElement;
      }
      if (current) {
        found.push(current);
      }
    }
    return new DomSelection(unique(found));
  }

  public children(selector?: string): DomSelection {
    return this.filtered(
      this.nodes.flatMap((node) => (node instanceof DomParentNode ? node.elementChildren : [])),
      selector,
    );
  }

  /**
   * Children including text and comment nodes
   */
  public contents(): DomSelection {
    return new DomSelection(this.nodes.flatMap((node) => (node instanceof DomParentNode ? node.children : [])));
  }

  public siblings(selector?: string): DomSelection {
    const siblings = this.nodes.flatMap((node) =>
      node.parent ? node.parent.elementChildren.filter((sibling) => sibling !== node) : [],
    );
    return this.filtered(unique(siblings), selector);
  }

  public next(selector?: string): DomSelection {
    return this.filtered(
      unique(this.nodes.map((node) => node.nextElementSibling).filter((node): node is DomElement => node !== null)),
      selector,
    );
  }

  public prev(selector?: string): DomSelection {
    return this.filtered(
      unique(this.nodes.map((node) => node.previousElementSibling).filter((node): node is DomElement => node !== null)),
      selector,
    );
  }

  public nextAll(selector?: string): DomSelection {
    const siblings: DomElement[] = [];
    for (const node of this.nodes) {
      for (let sibling = node.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
        siblings.push(sibling);
      }
    }
    return this.filtered(unique(siblings), selector);
  }

  public prevAll(selector?: string): DomSelection {
    const siblings: DomElement[] = [];
    for (const node of this.nodes) {
      for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
        siblings.push(sibling);
      }
    }
    return this.filtered(unique(siblings), selector);
  }

  public attr(): Record<string, string> | undefined;
  public attr(name: string): string | undefined;
  public attr(name: string, value: string | null): this;
  public attr(attributes: Record<string, string | null>): this;
  public attr(
    name?: string | Record<string, string | null>,
    value?: string | null,
  ): Record<string, string> | string | undefined | this {
    if (typeof name === "object") {
      for (const [key, attributeValue] of Object.entries(name)) {
        this.attr(key, attributeValue);
      }
      return this;
    }

    if (value !== undefined && name !== undefined) {
      for (const element of this.elements()) {
        if (value === null) {
          element.removeAttribute(name);
        } else {
          element.setAttribute(name, value);
        }
      }
      return this;
    }

    const element = this.elements()[0];
    if (!element) {
      return undefined;
    }

    if (name === undefined) {
      return Object.fromEntries(element.attributes);
    }

    const attribute = element.getAttribute(name);
    if (attribute === null) {
      return undefined;
    }

    return element.namespace === "html" && BOOLEAN_ATTRIBUTES.has(name.toLowerCase()) ? name : attribute;
  }

  public removeAttr(name: string): this {
    for (const element of this.elements()) {
      for (const attribute of splitClasses(name)) {
        element.removeAttribute(attribute);
      }
    }
    return this;
  }

  public hasClass(name: string): boolean {
    return this.elements().some((element) => element.classList.includes(name));
  }

  public addClass(names: string): this {
    return this.updateClasses((classes) => unique([...classes, ...splitClasses(names)]));
  }

  /**
   * Remove the given classes, or every class when called without argument
   */
  public removeClass(names?: string): this {
    const removed = names === undefined ? null : splitClasses(names);
    return this.updateClasses((classes) => (removed ? classes.filter((name) => !removed.includes(name)) : []));
  }

  public toggleClass(names: string, state?: boolean): this {
    const toggled = splitClasses(names);
    return this.updateClasses((classes) => {
      let result = [...classes];
      for (const name of toggled) {
        const add = state ?? !result.includes(name);
        result = add ? unique([...result, name]) : result.filter((existing) => existing !== name);
      }
      return result;
    });
  }

  public text(): string;
  public text(value: string): this;
  public text(value?: string): string | this {
    if (value === undefined) {
      return this.nodes.map((node) => node.textContent).join("");
    }

    for (const node of this.nodes) {
      if (node instanceof DomParentNode) {
        node.empty().appendChild(new DomText(value));
      }
    }
    return this;
  }

  /**
   * Inner HTML of the first node (`null` for an empty selection), or replace the content of every node
   */
  public html(): string | null;
  public html(value: DomContentType): this;
  public html(value?: DomContentType): string | null | this {
    if (value === undefined) {
      const node = this.nodes[0];
      return node ? serializeChildren(node) : null;
    }

    const targets = this.containers();
    for (const target of targets) {
      target.empty();
    }
    this.insert(targets, value, (target, node) => target.appendChild(node));
    return this;
  }

  public append(content: DomContentType): this {
    this.insert(this.containers(), content, (target, node) => target.appendChild(node));
    return this;
  }

  public prepend(content: DomContentType): this {
    this.insert(this.containers(), content, (target, node, index) =>
      target.insertBefore(node, target.children[index] ?? null),
    );
    return this;
  }

  public after(content: DomContentType): this {
    this.insert(this.attached(), content, (target, node, index) => {
      target.parent?.insertBefore(node, target.parent.children[target.index + 1 + index] ?? null);
    });
    return this;
  }

  public before(content: DomContentType): this {
    this.insert(this.attached(), content, (target, node) => target.parent?.insertBefore(node, target));
    return this;
  }

  public replaceWith(content: DomContentType): this {
    this.before(content);
    return this.remove();
  }

  /**
   * Detach the nodes (optionally only those matching the selector) from the tree
   */
  public remove(selector?: string): this {
    const nodes = selector ? this.filter(selector).toArray() : this.nodes;
    for (const node of nodes) {
      node.remove();
    }
    return this;
  }

  public empty(): this {
    for (const node of this.containers()) {
      node.empty();
    }
    return this;
  }

  public clone(): DomSelection {
    return new DomSelection(this.nodes.map((node) => node.clone()));
  }

  private predicate(filter: DomFilterType): (node: DomNode, index: number) => boolean {
    if (typeof filter === "string") {
      return (node) => node instanceof DomElement && matchesSelector(node, filter);
    }
    if (typeof filter === "function") {
      return (node, index) => filter(index, node);
    }
    const allowed = new Set(toNodes(filter));
    return (node) => allowed.has(node);
  }

  private filtered(nodes: DomElement[], selector?: string): DomSelection {
    return new DomSelection(selector ? nodes.filter((node) => matchesSelector(node, selector)) : nodes);
  }

  private containers(): DomParentNode[] {
    return this.nodes.filter((node): node is DomParentNode => node instanceof DomParentNode);
  }

  private attached(): DomNode[] {
    return this.nodes.filter((node) => node.parent !== null);
  }

  private updateClasses(update: (classes: string[]) => string[]): this {
    for (const element of this.elements()) {
      const classes = update(element.classList);
      if (classes.length > 0) {
        element.setAttribute("class", classes.join(" "));
      } else {
        element.removeAttribute("class");
      }
    }
    return this;
  }

  /**
   * Insert content relative to each target; every target but the last receives a clone of the content
   */
  private insert<T extends DomNode>(
    targets: T[],
    content: DomContentType,
    place: (target: T, node: DomNode, index: number) => void,
  ): void {
    const nodes = toNodes(content);
    for (const [targetIndex, target] of targets.entries()) {
      const isLast = targetIndex === targets.length - 1;
      for (const [index, node] of nodes.entries()) {
        place(target, isLast ? node : node.clone(), index);
      }
    }
  }
}
