import { describe, expect, test } from "bun:test";
import { parseFlow, parseQuoted, resolveScalar, YamlParser } from "@/parser/YamlParser";

const parse = (source: string): unknown => new YamlParser().parse(source);

describe("YamlParser", () => {
  test("should parse nested maps and sequences", () => {
    expect(
      parse(
        "title: Guide # comment\nauthor:\n  name: Ada\n  roles:\n    - admin\n    - editor\ntags:\n- a\n- b\nitems:\n  - id: 1\n    name: One\n  -\n  - - nested\n",
      ),
    ).toEqual({
      title: "Guide",
      author: { name: "Ada", roles: ["admin", "editor"] },
      tags: ["a", "b"],
      items: [{ id: 1, name: "One" }, null, ["nested"]],
    });
  });

  test("should resolve core schema scalars", () => {
    expect(
      parse("a: ~\nb: true\nc: False\nd: -12\ne: 0x1F\nf: 0o17\ng: 1.5e3\nh: .inf\ni: -.Inf\nj: 2024-01-01\nk:"),
    ).toEqual({
      a: null,
      b: true,
      c: false,
      d: -12,
      e: 31,
      f: 15,
      g: 1500,
      h: Number.POSITIVE_INFINITY,
      i: Number.NEGATIVE_INFINITY,
      j: "2024-01-01",
      k: null,
    });
    expect(resolveScalar(".nan")).toBeNaN();
  });

  test("should parse quoted scalars and keys", () => {
    expect(parse("\"a key\": \"line\\n\\u00e9 # not comment\"\n'b': 'it''s'")).toEqual({
      "a key": "line\né # not comment",
      b: "it's",
    });
  });

  test("should read quoted scalars that are not keys as values", () => {
    expect(parse('"just a string"')).toBe("just a string");
    expect(() => parse('"unclosed: x')).toThrow("Unterminated quoted scalar");
  });

  test("should parse flow collections", () => {
    expect(parse('list: [a, "b, c", [1, 2], {x: 1}, ]\nmap: {a: 1, "b": [true], c}\nempty: []')).toEqual({
      list: ["a", "b, c", [1, 2], { x: 1 }],
      map: { a: 1, b: [true], c: null },
      empty: [],
    });
  });

  test("should parse literal and folded block scalars with chomping", () => {
    expect(
      parse(
        "literal: |\n  a\n   b\n\nfolded: >\n  a\n  b\n\n  c\n    d\nstrip: |-\n  x\n\nkeep: |+\n  y\n\nexplicit: |2\n    z\nempty: >\nnext: 1",
      ),
    ).toEqual({
      literal: "a\n b\n",
      folded: "a b\nc\n  d\n",
      strip: "x",
      keep: "y\n\n",
      explicit: "  z\n",
      empty: "",
      next: 1,
    });
  });

  test("should fold multi-line plain scalars", () => {
    expect(parse("text: one\n  two\n  three")).toEqual({ text: "one two three" });
    expect(parse("plain words\nmore")).toBe("plain words more");
  });

  test("should return null for an empty document", () => {
    expect(parse("# only a comment\n\n")).toBeNull();
  });

  test("should not treat special keys as prototype setters", () => {
    const result = parse("__proto__: polluted") as Record<string, unknown>;

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(result.__proto__).toBe("polluted");
  });

  test.each([
    ["a: 1\n  b: 2", "Bad indentation"],
    ["a: 1\na: 2", 'Duplicate key "a"'],
    ["a:\n  - x\n  y: 1", "Bad indentation"],
    ["a: [1, 2", "Unterminated flow sequence"],
    ["a: {x: 1", "Unterminated flow mapping"],
    ["a: {x: 1 ] }", "Unterminated flow mapping"],
    ["a: [1 2] 3", "Unexpected characters after value"],
    ['a: "open', "Unterminated quoted scalar"],
    ['a: "\\q"', 'Invalid escape "\\q"'],
    ['a: "\\u12"', 'Invalid escape "\\u12"'],
    ["a: |x", "Invalid block scalar header"],
    ["a: 1\n- b", "Unexpected content"],
    ["a: 1\n[b]", "Expected a key/value pair"],
    ["a: x\n  - y", "Bad indentation"],
    ["- a\n  - b", "Bad indentation"],
  ])("should reject %j", (source, message) => {
    expect(() => parse(source)).toThrow(message);
  });

  describe("helpers", () => {
    test("parseQuoted should return the position after the closing quote", () => {
      expect(parseQuoted('x "a\\"b" y', 2)).toEqual(['a"b', 8]);
      expect(parseQuoted("'a''b'", 0)).toEqual(["a'b", 6]);
    });

    test("parseFlow should read scalars and collections", () => {
      expect(parseFlow(" 42 ,", 0)).toEqual([42, 4]);
      expect(parseFlow("['x']", 0)).toEqual([["x"], 5]);
    });
  });
});
