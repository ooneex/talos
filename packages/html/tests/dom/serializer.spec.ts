import { describe, expect, test } from "bun:test";
import { DomComment, DomDoctype, DomElement, DomText, parseHtml, serializeChildren, serializeNode } from "@/index";

describe("serializer", () => {
  test("should serialize elements with escaped attributes", () => {
    const element = new DomElement("a", [
      ["href", '/?a=1&b="2"'],
      ["hidden", ""],
    ]);
    element.appendChild(new DomText("x < y & z"));

    expect(serializeNode(element)).toBe('<a href="/?a=1&amp;b=&quot;2&quot;" hidden="">x &lt; y &amp; z</a>');
  });

  test("should serialize void elements without end tag", () => {
    expect(serializeNode(new DomElement("br"))).toBe("<br>");
  });

  test("should serialize empty foreign elements with an end tag", () => {
    expect(serializeNode(new DomElement("path", [], "svg"))).toBe("<path></path>");
  });

  test("should not escape raw text content", () => {
    expect(serializeChildren(parseHtml("<script>a < b && c</script>", { fragment: true }))).toBe(
      "<script>a < b && c</script>",
    );
  });

  test("should escape text in foreign elements named like raw text elements", () => {
    const style = new DomElement("style", [], "svg");
    style.appendChild(new DomText("a<b"));

    expect(serializeNode(style)).toBe("<style>a&lt;b</style>");
  });

  test("should serialize comments and doctypes", () => {
    expect(serializeNode(new DomComment(" c "))).toBe("<!-- c -->");
    expect(serializeNode(new DomDoctype("html"))).toBe("<!DOCTYPE html>");
  });

  test("should serialize a document as its children", () => {
    expect(serializeNode(parseHtml("<p>x</p>", { fragment: true }))).toBe("<p>x</p>");
  });

  test("should return an empty string for the children of a leaf node", () => {
    expect(serializeChildren(new DomText("x"))).toBe("");
  });

  test("should round-trip a parsed document", () => {
    const html =
      '<!DOCTYPE html><html lang="en"><head><title>T</title></head><body><p class="a">x&amp;y</p></body></html>';

    expect(serializeChildren(parseHtml(html))).toBe(html);
  });
});
