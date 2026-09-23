import { describe, expect, test } from "bun:test";
import { type DomElement, DomText, HtmlException, matchesSelector, parseHtml, parseSelector, selectAll } from "@/index";

const document = parseHtml(`<!DOCTYPE html><html lang="en"><head><title>T</title></head><body>
<div id="main" class="wrap big">
  <h1 id="t">Title <em>here</em></h1>
  <p class="intro lead" data-x="a-b c">Intro <a href="/a" rel="nofollow">A</a> and <a href="https://x.com/b.pdf" target="_blank">B</a></p>
  <ul id="list">
    <li class="item">one</li>
    <li class="item active">two <span>inner</span></li>
    <li class="item">three</li>
    <li class="item">four</li>
    <li>five</li>
  </ul>
  <form>
    <input type="checkbox" checked name="c1"><input type="CHECKBOX" name="c2"><input type="radio" checked>
    <input type="text" required disabled><input><select><option selected>o1</option><option>o2</option></select>
    <textarea></textarea><button>go</button><button type="reset">r</button><input type="submit"><input type="file">
    <input type="password"><input type="image"><input type="button">
  </form>
  <p></p><p> </p><p><!-- c --></p>
  <section lang="en-US"><h2>Sub</h2><p>Para 1</p><p>Para 2</p><div><p>Nested</p></div></section>
</div>
<svg viewBox="0 0 1 1"><circle r="1"></circle></svg>
</body></html>`);

const describeElement = (element: DomElement): string => {
  const id = element.getAttribute("id");
  const name = element.getAttribute("name");
  const type = element.getAttribute("type");
  const text = element.children
    .map((child) => (child instanceof DomText ? child.data : ""))
    .join("")
    .trim()
    .split(/\s+/)[0];
  return [
    element.name,
    id && `#${id}`,
    name && `@${name}`,
    type && `[${type}]`,
    !id && !name && !type && text && `"${text}"`,
  ]
    .filter(Boolean)
    .join("");
};

const select = (selector: string): string[] => selectAll(selector, [document]).map(describeElement);

describe("selector", () => {
  describe("simple selectors", () => {
    test.each([
      ["li", ['li"one"', 'li"two"', 'li"three"', 'li"four"', 'li"five"']],
      ["LI:first-child", ['li"one"']],
      ["#main", ["div#main"]],
      [".active", ['li"two"']],
      [".item.active", ['li"two"']],
      [".wrap.big", ["div#main"]],
      ["circle", ["circle"]],
      ["svg circle", ["circle"]],
      ["\\#main", []],
      ["#\\6D ain", ["div#main"]],
      ["#m\\a in", []],
      ["#\\m ain", []],
      ["#\\main", ["div#main"]],
      ["h1, h2", ["h1#t", 'h2"Sub"']],
      ["em, h1", ["h1#t", 'em"here"']],
      ["*:first-child > em", ['em"here"']],
    ])("%p", (selector, expected) => {
      expect(select(selector)).toEqual(expected);
    });
  });

  describe("combinators", () => {
    test.each([
      ["ul > li.active > span", ['span"inner"']],
      ["div p", ['p"Intro"', "p", "p", "p", 'p"Para"', 'p"Para"', 'p"Nested"']],
      ["h1 + p", ['p"Intro"']],
      ["h1 ~ ul", ["ul#list"]],
      ["h2 ~ p", ['p"Para"', 'p"Para"']],
      ["li + li + li:last-child", ['li"five"']],
      ["section > div > p", ['p"Nested"']],
      ["h1>em", ['em"here"']],
      ["h2+p", ['p"Para"']],
    ])("%p", (selector, expected) => {
      expect(select(selector)).toEqual(expected);
    });
  });

  describe("attribute selectors", () => {
    test.each([
      ["[href]", ['a"A"', 'a"B"']],
      ["[href^=https]", ['a"B"']],
      ['[href$=".pdf"]', ['a"B"']],
      ["[href*=x]", ['a"B"']],
      ['[data-x~="c"]', ['p"Intro"']],
      ['[data-x~="a"]', []],
      ['[data-x~="c d"]', []],
      ["[data-x|=a]", ['p"Intro"']],
      ["[lang|=en]", ["html", "section"]],
      ['[rel="NOFOLLOW" i]', ['a"A"']],
      ['[rel="NOFOLLOW"]', ['a"A"']],
      ['[target="_BLANK" s]', []],
      ["[ href = '/a' ]", ['a"A"']],
      ["[href^='']", []],
      ["[href$='']", []],
      ["[href*='']", []],
      ['[name!="c1"]:checkbox', ["input@c2[CHECKBOX]"]],
      ['[class="item"]', ['li"one"', 'li"three"', 'li"four"']],
      ['[id="\\"quoted"]', []],
      ["[title='a\\\nb']", []],
    ])("%p", (selector, expected) => {
      expect(select(selector)).toEqual(expected);
    });
  });

  describe("structural pseudo-classes", () => {
    test.each([
      ["li:first-child", ['li"one"']],
      ["li:last-child", ['li"five"']],
      ["span:only-child", ['span"inner"']],
      ["li:nth-child(2)", ['li"two"']],
      ["li:nth-child(odd)", ['li"one"', 'li"three"', 'li"five"']],
      ["li:nth-child(even)", ['li"two"', 'li"four"']],
      ["li:nth-child(2n+1)", ['li"one"', 'li"three"', 'li"five"']],
      ["li:nth-child(-n+2)", ['li"one"', 'li"two"']],
      ["li:nth-child( n + 4 )", ['li"four"', 'li"five"']],
      ["li:nth-child(+n+5)", ['li"five"']],
      ["li:nth-child(3n)", ['li"three"']],
      ["li:nth-last-child(2)", ['li"four"']],
      ["section p:nth-of-type(2)", ['p"Para"']],
      ["section > p:nth-last-of-type(1)", ['p"Para"']],
      ["section > p:first-of-type", ['p"Para"']],
      ["section > p:last-of-type", ['p"Para"']],
      ["h2:only-of-type", ['h2"Sub"']],
      ["p:empty", ["p", "p"]],
      ["form ~ p:parent", ["p"]],
      ["section p:parent", ['p"Para"', 'p"Para"', 'p"Nested"']],
      [":root", ["html"]],
    ])("%p", (selector, expected) => {
      expect(select(selector)).toEqual(expected);
    });
  });

  describe("logical pseudo-classes", () => {
    test.each([
      ["li:not(.item)", ['li"five"']],
      ["li:not(:first-child):not(:last-child)", ['li"two"', 'li"three"', 'li"four"']],
      ["li:is(.active, :last-child)", ['li"two"', 'li"five"']],
      ["li:where(.active)", ['li"two"']],
      ["li:matches(.active)", ['li"two"']],
      ["ul:has(> li.active)", ["ul#list"]],
      ["ul:has(> span)", []],
      ["section:has(div p)", ["section"]],
      ["h1:has(+ p)", ["h1#t"]],
      ["h1:has(~ ul)", ["h1#t"]],
      ["li:contains(t)", ['li"two"', 'li"three"']],
      ['p:contains("Para")', ['p"Para"', 'p"Para"']],
    ])("%p", (selector, expected) => {
      expect(select(selector)).toEqual(expected);
    });
  });

  describe("form and jQuery pseudo-classes", () => {
    test.each([
      [":checked", ["input@c1[checkbox]", "input[radio]", 'option"o1"']],
      [":selected", ['option"o1"']],
      [":disabled", ["input[text]"]],
      ["input:enabled:checkbox", ["input@c1[checkbox]", "input@c2[CHECKBOX]"]],
      [":required", ["input[text]"]],
      ["select:optional, textarea:optional", ["select", "textarea"]],
      [":header", ["h1#t", 'h2"Sub"']],
      [
        "form :input",
        [
          "input@c1[checkbox]",
          "input@c2[CHECKBOX]",
          "input[radio]",
          "input[text]",
          "input",
          "select",
          "textarea",
          'button"go"',
          "button[reset]",
          "input[submit]",
          "input[file]",
          "input[password]",
          "input[image]",
          "input[button]",
        ],
      ],
      [":button", ['button"go"', "button[reset]", "input[button]"]],
      [":text", ["input[text]", "input"]],
      [":checkbox", ["input@c1[checkbox]", "input@c2[CHECKBOX]"]],
      [":radio", ["input[radio]"]],
      [":submit", ["input[submit]"]],
      [":reset", ["button[reset]"]],
      [":file", ["input[file]"]],
      [":password", ["input[password]"]],
      [":image", ["input[image]"]],
      [":link", ['a"A"', 'a"B"']],
      [":any-link", ['a"A"', 'a"B"']],
      ["a:hover, a:focus, a:visited", []],
    ])("%p", (selector, expected) => {
      expect(select(selector)).toEqual(expected);
    });
  });

  describe("scope", () => {
    const list = document.descendants().find((element) => element.getAttribute("id") === "list") as DomElement;

    test("should scope selectors to the root", () => {
      expect(selectAll("div li", [list])).toEqual([]);
      expect(selectAll(":scope > li", [list])).toHaveLength(5);
      expect(selectAll("> li.active", [list]).map(describeElement)).toEqual(['li"two"']);
    });

    test("should reach siblings with a leading sibling combinator", () => {
      const heading = document.descendants().find((element) => element.name === "h1") as DomElement;

      expect(selectAll("+ p", [heading]).map(describeElement)).toEqual(['p"Intro"']);
      expect(selectAll("~ ul > li:first-child", [heading]).map(describeElement)).toEqual(['li"one"']);
    });

    test("should return results in document order without duplicates for multiple roots", () => {
      const [section, main] = [
        document.descendants().find((element) => element.name === "section") as DomElement,
        document.descendants().find((element) => element.getAttribute("id") === "main") as DomElement,
      ];

      expect(selectAll("h1, h2", [section, main]).map(describeElement)).toEqual(["h1#t", 'h2"Sub"']);
    });

    test("should find nothing inside leaf nodes", () => {
      const title = document.descendants().find((element) => element.name === "title") as DomElement;

      expect(selectAll("*", [title.children[0] as DomText])).toEqual([]);
    });
  });

  describe("template content", () => {
    const page = parseHtml(
      '<div id="host"><template id="tpl"><div class="inner"><a href="#">x</a></div></template><a href="/out">y</a><template id="next"><b>z</b></template></div>',
    );
    const find = (selector: string, root: DomElement | typeof page = page): string[] =>
      selectAll(selector, [root]).map(
        (element) => element.getAttribute("href") ?? element.getAttribute("id") ?? element.name,
      );
    const byId = (id: string): DomElement =>
      page.descendants().find((element) => element.getAttribute("id") === id) as DomElement;

    test("should not select inside template content", () => {
      expect(find("a")).toEqual(["/out"]);
      expect(find("template")).toEqual(["tpl", "next"]);
      expect(find("a", byId("tpl"))).toEqual([]);
      expect(find("div:has(b)")).toEqual([]);
    });

    test("should not match ancestors across a template boundary", () => {
      const inner = byId("tpl")
        .descendants()
        .find((element) => element.name === "a") as DomElement;

      expect(matchesSelector(inner, "#host a")).toBe(false);
      expect(matchesSelector(inner, "template > div > a")).toBe(false);
      expect(matchesSelector(inner, ".inner > a")).toBe(true);
    });

    test("should skip template content of siblings", () => {
      const host = byId("host");
      const [first] = host.elementChildren;

      expect(find("~ template", first as DomElement)).toEqual(["next"]);
      expect(find("~ * b", first as DomElement)).toEqual([]);
      expect(host.descendants().some((element) => element.name === "b")).toBe(true);
    });
  });

  describe("matchesSelector", () => {
    const item = document.descendants().find((element) => element.classList.includes("active")) as DomElement;

    test("should test a single element", () => {
      expect(matchesSelector(item, "ul li.item")).toBe(true);
      expect(matchesSelector(item, "ol li")).toBe(false);
    });

    test("should only match :scope against the given scope", () => {
      expect(matchesSelector(item, ":scope")).toBe(false);
      expect(matchesSelector(item, ":scope", item)).toBe(true);
    });
  });

  describe("parseSelector", () => {
    test("should cache parsed selectors", () => {
      expect(parseSelector("div > p")).toBe(parseSelector("div > p"));
    });

    test("should evict the cache when full", () => {
      const first = parseSelector("div.first-cached");
      for (let i = 0; i < 600; i++) {
        parseSelector(`.cache-${i}`);
      }
      expect(parseSelector("div.first-cached")).not.toBe(first);
    });

    test.each([
      ["", "empty selector"],
      ["div >", "empty selector"],
      ["> div", 'unexpected combinator ">"'],
      ["div,", "empty selector"],
      ["div)", 'unexpected ")"'],
      ["#", "expected identifier"],
      ["[href", "expected attribute operator"],
      ["[href=", "expected identifier"],
      ["[href=x i", 'expected "]"'],
      ["[href x]", "expected attribute operator"],
      ["[href='x]", "unterminated string"],
      ["p::before", "pseudo-elements are not supported"],
      [":unknown", 'unknown pseudo-class ":unknown"'],
      [":first-child(1)", 'unknown pseudo-class ":first-child()"'],
      [":not(p", 'expected ")"'],
      [":nth-child(x)", 'invalid nth expression "x"'],
      ["div !", 'unexpected "!"'],
    ])("should reject %p", (selector, reason) => {
      expect(() => parseSelector(selector)).toThrow(HtmlException);
      expect(() => parseSelector(selector)).toThrow(reason);
    });

    test("should decode escapes in identifiers and strings", () => {
      const element = parseHtml('<p class="a:b" title="x&quot;y">x</p>', {
        fragment: true,
      }).descendants()[0] as DomElement;

      expect(matchesSelector(element, ".a\\:b")).toBe(true);
      expect(matchesSelector(element, '[title="x\\"y"]')).toBe(true);
      expect(matchesSelector(element, "[title=x\\22 y]")).toBe(true);
      expect(matchesSelector(element, ".a\\0 b")).toBe(false);
      expect(matchesSelector(element, '[title="x\\22y"]')).toBe(true);
    });

    test("should accept non-ASCII identifiers", () => {
      const element = parseHtml('<p class="café">x</p>', { fragment: true }).descendants()[0] as DomElement;

      expect(matchesSelector(element, ".café")).toBe(true);
    });
  });
});
