import { describe, expect, test } from "bun:test";
import { DomComment, DomDoctype, DomDocument, DomElement, DomText, parseHtml } from "@/index";

describe("nodes", () => {
  describe("DomElement", () => {
    test("should expose name, tagName, namespace and kind", () => {
      const element = new DomElement("circle", [["r", "1"]], "svg");

      expect(element.kind).toBe("element");
      expect(element.name).toBe("circle");
      expect(element.tagName).toBe("circle");
      expect(element.namespace).toBe("svg");
    });

    test("should default to the html namespace without attributes", () => {
      const element = new DomElement("div");

      expect(element.namespace).toBe("html");
      expect(element.attributes.size).toBe(0);
    });

    test("should read attributes case-insensitively", () => {
      const element = new DomElement("svg", [["viewBox", "0 0 1 1"]], "svg");

      expect(element.getAttribute("viewBox")).toBe("0 0 1 1");
      expect(element.getAttribute("viewbox")).toBe("0 0 1 1");
      expect(element.getAttribute("missing")).toBeNull();
      expect(element.hasAttribute("VIEWBOX")).toBe(true);
    });

    test("should set and remove attributes", () => {
      const element = new DomElement("a").setAttribute("href", "/x");

      expect(element.getAttribute("href")).toBe("/x");
      expect(element.removeAttribute("href").hasAttribute("href")).toBe(false);
    });

    test("should list classes", () => {
      expect(new DomElement("p", [["class", " a\tb  c "]]).classList).toEqual(["a", "b", "c"]);
      expect(new DomElement("p").classList).toEqual([]);
    });

    test("should deep clone", () => {
      const element = parseHtml("<div id=a><p>x</p></div>", { fragment: true }).children[0] as DomElement;
      const clone = element.clone();

      expect(clone).not.toBe(element);
      expect(clone.getAttribute("id")).toBe("a");
      expect(clone.textContent).toBe("x");
      expect(clone.parent).toBeNull();
      clone.setAttribute("id", "b");
      expect(element.getAttribute("id")).toBe("a");
    });
  });

  describe("tree navigation", () => {
    const document = parseHtml("<a></a>text<b></b><!--c--><i></i>", { fragment: true });
    const [a, text, b, comment, i] = document.children;

    test("should compute index and siblings", () => {
      expect(b?.index).toBe(2);
      expect(new DomText("x").index).toBe(-1);
      expect(b?.previousSibling).toBe(text as DomText);
      expect(b?.nextSibling).toBe(comment as DomComment);
      expect(a?.previousSibling).toBeNull();
      expect(i?.nextSibling).toBeNull();
      expect(new DomText("x").previousSibling).toBeNull();
    });

    test("should compute element siblings", () => {
      expect(b?.previousElementSibling).toBe(a as DomElement);
      expect(b?.nextElementSibling).toBe(i as DomElement);
      expect(a?.previousElementSibling).toBeNull();
      expect(i?.nextElementSibling).toBeNull();
    });

    test("should return the parent element only for element parents", () => {
      expect(a?.parentElement).toBeNull();
      const element = parseHtml("<p><b>x</b></p>", { fragment: true }).descendants()[1];
      expect(element?.parentElement?.name).toBe("p");
    });

    test("should list element children and descendants in document order", () => {
      const root = parseHtml("<div><p><b></b></p><i></i></div>", { fragment: true });

      expect(root.descendants().map((element) => element.name)).toEqual(["div", "p", "b", "i"]);
      expect((root.children[0] as DomElement).elementChildren.map((element) => element.name)).toEqual(["p", "i"]);
    });
  });

  describe("text content", () => {
    test("should concatenate text descendants and skip comments", () => {
      const document = parseHtml("<p>a<b>b</b><!--c-->d</p>", { fragment: true });

      expect(document.textContent).toBe("abd");
      expect(new DomComment("x").textContent).toBe("");
      expect(new DomDoctype("html").textContent).toBe("");
    });
  });

  describe("mutation", () => {
    test("should append, prepend and insert children", () => {
      const parent = new DomElement("ul");
      const b = parent.appendChild(new DomElement("b"));
      const a = parent.prependChild(new DomElement("a"));
      const middle = parent.insertBefore(new DomText("m"), b);

      expect(parent.children).toEqual([a, middle, b]);
      expect(middle.parent).toBe(parent);
    });

    test("should append when the reference is not a child", () => {
      const parent = new DomElement("div");
      const node = parent.insertBefore(new DomText("x"), new DomText("other"));

      expect(parent.children).toEqual([node]);
    });

    test("should move a node from its previous parent", () => {
      const first = new DomElement("div");
      const second = new DomElement("div");
      const child = first.appendChild(new DomText("x"));

      second.appendChild(child);

      expect(first.children).toEqual([]);
      expect(child.parent).toBe(second);
    });

    test("should remove nodes", () => {
      const parent = new DomElement("div");
      const child = parent.appendChild(new DomText("x"));

      expect(child.remove()).toBe(child);
      expect(child.parent).toBeNull();
      expect(parent.children).toEqual([]);
      expect(parent.removeChild(child)).toBe(child);
      expect(new DomText("detached").remove().parent).toBeNull();
    });

    test("should empty a parent", () => {
      const parent = new DomElement("div");
      const child = parent.appendChild(new DomText("x"));

      expect(parent.empty().children).toEqual([]);
      expect(child.parent).toBeNull();
    });
  });

  describe("cloning", () => {
    test("should clone every node type", () => {
      const document = parseHtml("<!DOCTYPE html><!--c--><p>x</p>");
      const clone = document.clone();

      expect(clone).toBeInstanceOf(DomDocument);
      expect(clone.children[0]).toBeInstanceOf(DomDoctype);
      expect((clone.children[1] as DomComment).data).toBe("c");
      expect(clone.textContent).toBe("x");
      expect(new DomText("t").clone().data).toBe("t");
    });
  });
});
