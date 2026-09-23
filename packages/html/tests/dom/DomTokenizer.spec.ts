import { describe, expect, test } from "bun:test";
import { DomTokenizer, type DomTokenType } from "@/index";

const tokenize = (input: string): DomTokenType[] => {
  const tokenizer = new DomTokenizer(input);
  const tokens: DomTokenType[] = [];
  let token = tokenizer.next();
  while (token) {
    tokens.push(token);
    token = tokenizer.next();
  }
  return tokens;
};

describe("DomTokenizer", () => {
  test("should return null for empty input", () => {
    expect(new DomTokenizer("").next()).toBeNull();
  });

  test("should tokenize text with decoded entities", () => {
    expect(tokenize("a &amp; b")).toEqual([{ type: "text", data: "a & b" }]);
  });

  test("should normalize newlines", () => {
    expect(tokenize("a\r\nb\rc")).toEqual([{ type: "text", data: "a\nb\nc" }]);
  });

  test("should tokenize start tags with attributes", () => {
    expect(tokenize(`<DIV Id="a" class='b c' data-x=y hidden data-e="&lt;">`)).toEqual([
      {
        type: "startTag",
        name: "div",
        attributes: [
          ["id", "a"],
          ["class", "b c"],
          ["data-x", "y"],
          ["hidden", ""],
          ["data-e", "<"],
        ],
        selfClosing: false,
      },
    ]);
  });

  test("should tokenize self-closing tags and stray slashes", () => {
    expect(tokenize("<br/><img / src=a />")).toEqual([
      { type: "startTag", name: "br", attributes: [], selfClosing: true },
      { type: "startTag", name: "img", attributes: [["src", "a"]], selfClosing: true },
    ]);
  });

  test("should allow whitespace around the equals sign", () => {
    expect(tokenize("<a href = 'x' >")).toEqual([
      { type: "startTag", name: "a", attributes: [["href", "x"]], selfClosing: false },
    ]);
  });

  test("should keep the first duplicate attribute", () => {
    expect(tokenize("<a x=1 X=2>")).toEqual([
      { type: "startTag", name: "a", attributes: [["x", "1"]], selfClosing: false },
    ]);
  });

  test("should allow an attribute name starting with =", () => {
    expect(tokenize("<a =x>")).toEqual([{ type: "startTag", name: "a", attributes: [["=x", ""]], selfClosing: false }]);
  });

  test("should drop tags cut off by the end of input", () => {
    expect(tokenize("<div")).toEqual([]);
    expect(tokenize("<div a='x")).toEqual([]);
    expect(tokenize("<div a")).toEqual([]);
    expect(tokenize("</div")).toEqual([]);
  });

  test("should tokenize end tags and ignore their attributes", () => {
    expect(tokenize("</P class='x>y'>")).toEqual([{ type: "endTag", name: "p" }]);
  });

  test("should ignore </>", () => {
    expect(tokenize("a</>b")).toEqual([
      { type: "text", data: "a" },
      { type: "text", data: "b" },
    ]);
  });

  test("should emit a trailing </ as text", () => {
    expect(tokenize("a</")).toEqual([
      { type: "text", data: "a" },
      { type: "text", data: "</" },
    ]);
  });

  test("should turn invalid end tags into bogus comments", () => {
    expect(tokenize("</ x>")).toEqual([{ type: "comment", data: " x" }]);
    expect(tokenize("</1")).toEqual([{ type: "comment", data: "1" }]);
  });

  test("should emit < not followed by a tag as text", () => {
    expect(tokenize("a < b")).toEqual([
      { type: "text", data: "a " },
      { type: "text", data: "<" },
      { type: "text", data: " b" },
    ]);
  });

  test("should tokenize comments", () => {
    expect(tokenize("<!-- x -->")).toEqual([{ type: "comment", data: " x " }]);
    expect(tokenize("<!---->")).toEqual([{ type: "comment", data: "" }]);
    expect(tokenize("<!-->")).toEqual([{ type: "comment", data: "" }]);
    expect(tokenize("<!--->")).toEqual([{ type: "comment", data: "" }]);
    expect(tokenize("<!-- open")).toEqual([{ type: "comment", data: " open" }]);
  });

  test("should tokenize doctypes", () => {
    expect(tokenize("<!DOCTYPE HTML>")).toEqual([{ type: "doctype", name: "html" }]);
    expect(tokenize('<!doctype html PUBLIC "x">')).toEqual([{ type: "doctype", name: "html" }]);
    expect(tokenize("<!DOCTYPE html")).toEqual([{ type: "doctype", name: "html" }]);
    expect(tokenize("<!DOCTYPE>")).toEqual([{ type: "doctype", name: "" }]);
  });

  test("should turn processing instructions and CDATA into bogus comments", () => {
    expect(tokenize("<?xml v?>")).toEqual([{ type: "comment", data: "?xml v?" }]);
    expect(tokenize("<![CDATA[x]]>")).toEqual([{ type: "comment", data: "[CDATA[x]]" }]);
    expect(tokenize("<!x")).toEqual([{ type: "comment", data: "x" }]);
  });

  describe("text modes", () => {
    test("should read raw text up to the matching end tag", () => {
      const tokenizer = new DomTokenizer("if (a<b) '</div>' &amp;</SCRIPT >x");
      tokenizer.setTextMode("rawtext", "script");

      expect(tokenizer.next()).toEqual({ type: "text", data: "if (a<b) '</div>' &amp;" });
      expect(tokenizer.next()).toEqual({ type: "endTag", name: "script" });
      expect(tokenizer.next()).toEqual({ type: "text", data: "x" });
    });

    test("should not end raw text on a longer tag name", () => {
      const tokenizer = new DomTokenizer("a</scripts></script>");
      tokenizer.setTextMode("rawtext", "script");

      expect(tokenizer.next()).toEqual({ type: "text", data: "a</scripts>" });
    });

    test("should decode entities in rcdata", () => {
      const tokenizer = new DomTokenizer("a &amp; <b></title>");
      tokenizer.setTextMode("rcdata", "title");

      expect(tokenizer.next()).toEqual({ type: "text", data: "a & <b>" });
    });

    test("should read raw text until the end of input when unterminated", () => {
      const tokenizer = new DomTokenizer("never closed");
      tokenizer.setTextMode("rawtext", "style");

      expect(tokenizer.next()).toEqual({ type: "text", data: "never closed" });
      expect(tokenizer.next()).toBeNull();
    });

    test("should skip empty raw text", () => {
      const tokenizer = new DomTokenizer("</style>");
      tokenizer.setTextMode("rawtext", "style");

      expect(tokenizer.next()).toEqual({ type: "endTag", name: "style" });
    });

    test("should read everything in plaintext mode", () => {
      const tokenizer = new DomTokenizer("<b>x</plaintext>");
      tokenizer.setTextMode("plaintext", "plaintext");

      expect(tokenizer.next()).toEqual({ type: "text", data: "<b>x</plaintext>" });
      expect(tokenizer.next()).toBeNull();
    });
  });
});
