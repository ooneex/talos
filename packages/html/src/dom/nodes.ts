export type DomNodeKindType = "document" | "element" | "text" | "comment" | "doctype";

export type DomNamespaceType = "html" | "svg" | "math";

export abstract class DomNode {
  public abstract readonly kind: DomNodeKindType;
  public parent: DomParentNode | null = null;

  public get index(): number {
    return this.parent ? this.parent.children.indexOf(this) : -1;
  }

  public get previousSibling(): DomNode | null {
    return this.parent?.children[this.index - 1] ?? null;
  }

  public get nextSibling(): DomNode | null {
    return this.parent?.children[this.index + 1] ?? null;
  }

  public get previousElementSibling(): DomElement | null {
    let node = this.previousSibling;
    while (node && !(node instanceof DomElement)) {
      node = node.previousSibling;
    }
    return node;
  }

  public get nextElementSibling(): DomElement | null {
    let node = this.nextSibling;
    while (node && !(node instanceof DomElement)) {
      node = node.nextSibling;
    }
    return node;
  }

  public get parentElement(): DomElement | null {
    return this.parent instanceof DomElement ? this.parent : null;
  }

  public get textContent(): string {
    return "";
  }

  public remove(): this {
    this.parent?.removeChild(this);
    return this;
  }

  public abstract clone(): DomNode;
}

export abstract class DomParentNode extends DomNode {
  public children: DomNode[] = [];

  public get elementChildren(): DomElement[] {
    return this.children.filter((child): child is DomElement => child instanceof DomElement);
  }

  public override get textContent(): string {
    let text = "";
    for (const child of this.children) {
      if (child instanceof DomText || child instanceof DomParentNode) {
        text += child.textContent;
      }
    }
    return text;
  }

  public appendChild<T extends DomNode>(node: T): T {
    return this.insertBefore(node, null);
  }

  public prependChild<T extends DomNode>(node: T): T {
    return this.insertBefore(node, this.children[0] ?? null);
  }

  public insertBefore<T extends DomNode>(node: T, reference: DomNode | null): T {
    node.remove();
    const index = reference && reference.parent === this ? this.children.indexOf(reference) : this.children.length;
    this.children.splice(index, 0, node);
    node.parent = this;
    return node;
  }

  public removeChild<T extends DomNode>(node: T): T {
    const index = this.children.indexOf(node);
    if (index !== -1) {
      this.children.splice(index, 1);
      node.parent = null;
    }
    return node;
  }

  public empty(): this {
    for (const child of this.children) {
      child.parent = null;
    }
    this.children = [];
    return this;
  }

  /**
   * All descendant elements in document order
   * @param includeTemplateContent - whether to descend into the inert content of `<template>` elements
   */
  public descendants(includeTemplateContent = true): DomElement[] {
    const result: DomElement[] = [];
    const stack: DomNode[] = [...this.children].reverse();

    while (stack.length > 0) {
      const node = stack.pop() as DomNode;
      if (node instanceof DomElement) {
        result.push(node);
        if (!includeTemplateContent && node.isTemplate) {
          continue;
        }
        for (let i = node.children.length - 1; i >= 0; i--) {
          stack.push(node.children[i] as DomNode);
        }
      }
    }

    return result;
  }

  protected cloneChildrenInto<T extends DomParentNode>(target: T): T {
    for (const child of this.children) {
      target.appendChild(child.clone());
    }
    return target;
  }
}

export class DomDocument extends DomParentNode {
  public readonly kind = "document";

  public clone(): DomDocument {
    return this.cloneChildrenInto(new DomDocument());
  }
}

export class DomElement extends DomParentNode {
  public readonly kind = "element";
  public readonly name: string;
  public readonly namespace: DomNamespaceType;
  public readonly attributes: Map<string, string>;

  constructor(name: string, attributes?: Iterable<[string, string]>, namespace: DomNamespaceType = "html") {
    super();
    this.name = name;
    this.namespace = namespace;
    this.attributes = new Map(attributes);
  }

  public get tagName(): string {
    return this.name;
  }

  /**
   * Template content is an inert fragment: selectors neither match inside it nor across it
   */
  public get isTemplate(): boolean {
    return this.namespace === "html" && this.name === "template";
  }

  public getAttribute(name: string): string | null {
    const value = this.attributes.get(name);
    if (value !== undefined) {
      return value;
    }

    const lower = name.toLowerCase();
    for (const [key, attributeValue] of this.attributes) {
      if (key.toLowerCase() === lower) {
        return attributeValue;
      }
    }

    return null;
  }

  public hasAttribute(name: string): boolean {
    return this.getAttribute(name) !== null;
  }

  public setAttribute(name: string, value: string): this {
    this.attributes.set(name, value);
    return this;
  }

  public removeAttribute(name: string): this {
    this.attributes.delete(name);
    return this;
  }

  public get classList(): string[] {
    return (this.getAttribute("class") ?? "").split(/[\t\n\f\r ]+/).filter(Boolean);
  }

  public clone(): DomElement {
    return this.cloneChildrenInto(new DomElement(this.name, this.attributes, this.namespace));
  }
}

export class DomText extends DomNode {
  public readonly kind = "text";
  public data: string;

  constructor(data: string) {
    super();
    this.data = data;
  }

  public override get textContent(): string {
    return this.data;
  }

  public clone(): DomText {
    return new DomText(this.data);
  }
}

export class DomComment extends DomNode {
  public readonly kind = "comment";
  public data: string;

  constructor(data: string) {
    super();
    this.data = data;
  }

  public clone(): DomComment {
    return new DomComment(this.data);
  }
}

export class DomDoctype extends DomNode {
  public readonly kind = "doctype";
  public readonly name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }

  public clone(): DomDoctype {
    return new DomDoctype(this.name);
  }
}
