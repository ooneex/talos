import { describe, expect, test } from "bun:test";
import { BlockParser, markdownToHtml, parseMarkdown, resolveOptions, splitTableRow } from "@/index";

describe("BlockParser", () => {
  test("should parse ATX and setext headings", () => {
    expect(parseMarkdown("## Title ##\n\nSub\n===\n\nOther\n---").blocks).toEqual([
      { type: "heading", level: 2, content: "Title" },
      { type: "heading", level: 1, content: "Sub" },
      { type: "heading", level: 2, content: "Other" },
    ]);
    expect(parseMarkdown("### ###").blocks).toEqual([{ type: "heading", level: 3, content: "" }]);
  });

  test("should parse fenced and indented code blocks", () => {
    expect(parseMarkdown("~~~ js title=x\n  a\n~~~\n\n    b\n\n    c\n").blocks).toEqual([
      { type: "code", language: "js", code: "  a\n" },
      { type: "code", language: null, code: "b\n\nc\n" },
    ]);
  });

  test("should strip the fence indentation from content lines", () => {
    expect(parseMarkdown("  ```\n  a\n b\nc\n  ```").blocks).toEqual([
      { type: "code", language: null, code: "a\nb\nc\n" },
    ]);
  });

  test("should close an unterminated fence at the end of the document", () => {
    expect(parseMarkdown("```\nopen\n").blocks).toEqual([{ type: "code", language: null, code: "open\n" }]);
  });

  test("should parse blockquotes with lazy continuation lines", () => {
    expect(parseMarkdown("> # Quote\n> text\nlazy").blocks).toEqual([
      {
        type: "blockquote",
        children: [
          { type: "heading", level: 1, content: "Quote" },
          { type: "paragraph", content: "text\nlazy" },
        ],
      },
    ]);
  });

  test("should parse tight, loose, ordered and nested lists", () => {
    const [tight, loose, ordered] = parseMarkdown("- a\n  - b\n\n* c\n\n* d\n\n3) e\n4) f").blocks;

    expect(tight).toMatchObject({ type: "list", ordered: false, tight: true });
    expect(tight?.type === "list" && tight.items[0]?.children[1]?.type).toBe("list");
    expect(loose).toMatchObject({ type: "list", tight: false });
    expect(ordered).toMatchObject({ type: "list", ordered: true, start: 3 });
  });

  test("should parse task list items", () => {
    const [list] = parseMarkdown("- [x] done\n- [ ] todo\n- [x]").blocks;

    expect(list?.type === "list" && list.items.map((item) => item.checked)).toEqual([true, false, null]);
  });

  test("should keep task markers as text when task lists are disabled", () => {
    const [list] = parseMarkdown("- [x] done", { tasklists: false }).blocks;

    expect(list?.type === "list" && list.items[0]?.checked).toBeNull();
    expect(markdownToHtml("- [x] done", { tasklists: false })).toBe("<ul>\n<li>[x] done</li>\n</ul>\n");
  });

  test("should parse GFM tables with alignment and padding", () => {
    expect(parseMarkdown("| a | b | c | d |\n|:--|--:|:-:|---|\n| 1 | 2 \\| 3 |\n- next").blocks[0]).toEqual({
      type: "table",
      align: ["left", "right", "center", null],
      header: ["a", "b", "c", "d"],
      rows: [["1", "2 | 3", "", ""]],
    });
  });

  test("should not parse tables when disabled or when the column counts differ", () => {
    expect(parseMarkdown("| a |\n|---|", { tables: false }).blocks[0]?.type).toBe("paragraph");
    expect(parseMarkdown("a | b\n---").blocks[0]).toEqual({ type: "heading", level: 2, content: "a | b" });
  });

  test("should let a table interrupt a paragraph", () => {
    expect(parseMarkdown("intro\n| a |\n| - |").blocks.map((block) => block.type)).toEqual(["paragraph", "table"]);
  });

  test("should parse HTML blocks unless sanitizing", () => {
    expect(parseMarkdown("<div>\n*x*\n</div>").blocks).toEqual([{ type: "html", content: "<div>\n*x*\n</div>" }]);
    expect(parseMarkdown("<!-- a\nb -->\ntext").blocks[0]).toEqual({ type: "html", content: "<!-- a\nb -->" });
    expect(parseMarkdown("<div>x</div>", { sanitize: true }).blocks[0]?.type).toBe("paragraph");
  });

  test("should collect link reference definitions", () => {
    const document = parseMarkdown('[Foo  Bar]: <my url> "Title"\n[foo bar]: /ignored\n\n[x]: /x\n(multi)');

    expect(document.blocks).toEqual([]);
    expect(document.references.get("FOO BAR")).toEqual({ href: "my url", title: "Title" });
    expect(document.references.get("X")).toEqual({ href: "/x", title: "multi" });
  });

  test("should keep a paragraph when a reference definition is followed by text", () => {
    expect(parseMarkdown("[a]: /a\ntext").blocks).toEqual([{ type: "paragraph", content: "text" }]);
  });

  test("should expand leading tabs and normalize line endings", () => {
    expect(parseMarkdown("\tcode\r\nnext").blocks).toEqual([
      { type: "code", language: null, code: "code\n" },
      { type: "paragraph", content: "next" },
    ]);
  });

  test("should be reusable across documents", () => {
    const parser = new BlockParser(resolveOptions());
    parser.parse("[a]: /a");

    expect(parser.parse("x").references.size).toBe(0);
  });

  describe("splitTableRow", () => {
    test("should split on unescaped pipes and trim edges", () => {
      expect(splitTableRow("| a | b\\|c |")).toEqual(["a", "b|c"]);
      expect(splitTableRow("a|b")).toEqual(["a", "b"]);
      expect(splitTableRow("a \\|")).toEqual(["a |"]);
    });
  });
});
