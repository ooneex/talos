import { describe, expect, test } from "bun:test";
import { decodeEntities, escapeAttribute, escapeText } from "@/index";

describe("entities", () => {
  describe("decodeEntities", () => {
    test("should return input without ampersands unchanged", () => {
      expect(decodeEntities("plain text")).toBe("plain text");
    });

    test("should decode named entities", () => {
      expect(decodeEntities("&lt;a&gt; &amp; &quot;b&quot; &apos;c&apos; &copy; &euro; &hellip; &nbsp;")).toBe(
        "<a> & \"b\" 'c' © € … \u00A0",
      );
    });

    test("should decode Latin-1 entities", () => {
      expect(decodeEntities("&eacute;&Agrave;&yuml;&iexcl;")).toBe("éÀÿ¡");
    });

    test("should decode decimal and hexadecimal references", () => {
      expect(decodeEntities("&#65;&#x42;&#X43;&#x1F600;")).toBe("ABC😀");
    });

    test("should decode numeric references without semicolon", () => {
      expect(decodeEntities("&#65b")).toBe("Ab");
    });

    test("should replace invalid code points", () => {
      expect(decodeEntities("&#0;&#xD800;&#x110000;")).toBe("\uFFFD\uFFFD\uFFFD");
    });

    test("should remap Windows-1252 code points", () => {
      expect(decodeEntities("&#128;&#150;&#x81;")).toBe("€–\u0081");
    });

    test("should leave numeric references without digits", () => {
      expect(decodeEntities("&#;&#x;")).toBe("&#;&#x;");
    });

    test("should decode legacy entities without semicolon in text", () => {
      expect(decodeEntities("&copy 2024 &ampx &notit;")).toBe("© 2024 &x ¬it;");
    });

    test("should not decode legacy entities followed by alphanumerics or = in attributes", () => {
      expect(decodeEntities("?a=1&copy=2&ampx&amp;y&lt", true)).toBe("?a=1&copy=2&ampx&y<");
    });

    test("should leave unknown entities", () => {
      expect(decodeEntities("&bogus; & a&b &")).toBe("&bogus; & a&b &");
    });

    test("should prefer the full name when it ends with a semicolon", () => {
      expect(decodeEntities("&notin;")).toBe("∉");
    });
  });

  describe("escapeText", () => {
    test("should escape &, <, > and no-break spaces", () => {
      expect(escapeText('a & <b> "c"\u00A0')).toBe('a &amp; &lt;b&gt; "c"&nbsp;');
    });
  });

  describe("escapeAttribute", () => {
    test("should escape &, double quotes and no-break spaces", () => {
      expect(escapeAttribute("a & \"b\" <c> 'd'\u00A0")).toBe("a &amp; &quot;b&quot; <c> 'd'&nbsp;");
    });
  });
});
