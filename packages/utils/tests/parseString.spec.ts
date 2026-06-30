import { describe, expect, test } from "bun:test";
import { parseString } from "@/parseString";

describe("parseString", () => {
  describe("empty string handling", () => {
    test("should return empty string for empty input", () => {
      expect(parseString("") as string).toBe("");
    });
  });

  describe("integer parsing", () => {
    test("should parse positive integers", () => {
      expect(parseString("123") as number).toBe(123);
      expect(parseString("0") as number).toBe(0);
      expect(parseString("42") as number).toBe(42);
    });

    test("should parse negative integers", () => {
      expect(parseString("-123") as number).toBe(-123);
      expect(parseString("-1") as number).toBe(-1);
      expect(parseString("-999") as number).toBe(-999);
    });

    test("should parse large integers", () => {
      expect(parseString("2147483647") as number).toBe(2_147_483_647);
      expect(parseString("-2147483648") as number).toBe(-2_147_483_648);
    });
  });

  describe("float parsing", () => {
    test("should parse positive floats", () => {
      expect(parseString("123.45") as number).toBe(123.45);
      expect(parseString("0.5") as number).toBe(0.5);
      // biome-ignore lint/suspicious/noApproximativeNumericConstant: trust me
      expect(parseString("3.14159") as number).toBe(3.141_59);
    });

    test("should parse negative floats", () => {
      expect(parseString("-123.45") as number).toBe(-123.45);
      expect(parseString("-0.5") as number).toBe(-0.5);
      expect(parseString("-99.999") as number).toBe(-99.999);
    });

    test("should parse floats with leading zero", () => {
      expect(parseString("0.123") as number).toBe(0.123);
      expect(parseString("-0.456") as number).toBe(-0.456);
    });
  });

  describe("scientific notation parsing", () => {
    test("should parse basic scientific notation", () => {
      expect(parseString("1e5") as number).toBe(100_000);
      expect(parseString("2e3") as number).toBe(2000);
      expect(parseString("5e0") as number).toBe(5);
    });

    test("should parse negative base scientific notation", () => {
      expect(parseString("-1e5") as number).toBe(-100_000);
      expect(parseString("-2.5e3") as number).toBe(-2500);
    });

    test("should parse scientific notation with positive exponent", () => {
      expect(parseString("1e+5") as number).toBe(100_000);
      expect(parseString("2.5e+3") as number).toBe(2500);
      expect(parseString("1.23e+2") as number).toBe(123);
    });

    test("should parse scientific notation with negative exponent", () => {
      expect(parseString("1e-3") as number).toBe(0.001);
      expect(parseString("2.5e-2") as number).toBe(0.025);
      expect(parseString("5e-1") as number).toBe(0.5);
    });

    test("should parse uppercase E notation", () => {
      expect(parseString("1E5") as number).toBe(100_000);
      expect(parseString("2.5E-3") as number).toBe(0.0025);
      expect(parseString("-1.2E+10") as number).toBe(-12_000_000_000);
    });

    test("should parse decimal scientific notation", () => {
      expect(parseString("1.5e3") as number).toBe(1500);
      expect(parseString("2.25e-1") as number).toBe(0.225);
      expect(parseString("0.5e2") as number).toBe(50);
    });
  });

  describe("boolean parsing", () => {
    test("should parse true values", () => {
      expect(parseString("true") as boolean).toBe(true);
      expect(parseString("True") as boolean).toBe(true);
      expect(parseString("TRUE") as boolean).toBe(true);
      expect(parseString("TrUe") as boolean).toBe(true);
    });

    test("should parse false values", () => {
      expect(parseString("false") as boolean).toBe(false);
      expect(parseString("False") as boolean).toBe(false);
      expect(parseString("FALSE") as boolean).toBe(false);
      expect(parseString("FaLsE") as boolean).toBe(false);
    });
  });

  describe("null and undefined parsing", () => {
    test("should parse null values", () => {
      expect(parseString("null") as null).toBe(null);
      expect(parseString("Null") as null).toBe(null);
      expect(parseString("NULL") as null).toBe(null);
      expect(parseString("NuLl") as null).toBe(null);
    });
  });

  describe("array parsing", () => {
    test("should parse simple arrays", () => {
      expect(parseString("[1,2,3]") as number[]).toEqual([1, 2, 3]);
      expect(parseString("[1, 2, 3]") as number[]).toEqual([1, 2, 3]);
      expect(parseString("[ 1 , 2 , 3 ]") as number[]).toEqual([1, 2, 3]);
    });

    test("should parse arrays with strings", () => {
      expect(parseString('["hello", "world"]') as string[]).toEqual(["hello", "world"]);
      expect(parseString("['a', 'b', 'c']") as string[]).toEqual(["'a'", "'b'", "'c'"]);
    });

    test("should parse arrays with objects", () => {
      expect(parseString('[{"a": 1}, {"b": 2}]') as object[]).toEqual([{ a: 1 }, { b: 2 }]);
    });
  });

  describe("object parsing", () => {
    test("should parse empty objects", () => {
      expect(parseString("{}") as object).toEqual({});
      expect(parseString("{ }") as object).toEqual({});
      expect(parseString("{  }") as object).toEqual({});
    });

    test("should parse simple objects", () => {
      expect(parseString('{"name": "John"}') as object).toEqual({
        name: "John",
      });
      expect(parseString('{"age": 30}') as object).toEqual({ age: 30 });
      expect(parseString('{"active": true}') as object).toEqual({
        active: true,
      });
    });

    test("should parse objects with multiple properties", () => {
      expect(parseString('{"name": "John", "age": 30}') as object).toEqual({
        name: "John",
        age: 30,
      });
      expect(parseString('{"a": 1, "b": true, "c": null}') as object).toEqual({
        a: 1,
        b: true,
        c: null,
      });
    });

    test("should return string for objects with undefined (invalid JSON)", () => {
      expect(parseString('{"a": 1, "b": true, "c": null, "d": undefined}') as string).toBe(
        '{"a": 1, "b": true, "c": null, "d": undefined}',
      );
    });

    test("should parse nested objects", () => {
      expect(parseString('{"user": {"name": "John", "age": 30}}') as object).toEqual({
        user: { name: "John", age: 30 },
      });
    });

    test("should parse objects with arrays", () => {
      expect(parseString('{"numbers": [1, 2, 3]}') as object).toEqual({
        numbers: [1, 2, 3],
      });
    });

    test("should return original string for malformed objects", () => {
      expect(parseString("{invalid}") as string).toBe("{invalid}");
      expect(parseString("{name: test}") as string).toBe("{name: test}");
      expect(parseString('{"unclosed": ') as string).toBe('{"unclosed": ');
    });
  });

  describe("JSON parsing fallback", () => {
    test("should parse valid JSON strings", () => {
      expect(parseString('"hello world"') as string).toBe("hello world");
      expect(parseString('"123"') as string).toBe("123");
      expect(parseString('""') as string).toBe("");
    });

    test("should parse JSON numbers", () => {
      expect(parseString("123") as number).toBe(123);
      expect(parseString("123.45") as number).toBe(123.45);
      expect(parseString("-123") as number).toBe(-123);
    });

    test("should handle special numeric values as strings", () => {
      expect(parseString("Infinity") as string).toBe("Infinity");
      expect(parseString("-Infinity") as string).toBe("-Infinity");
      expect(parseString("NaN") as string).toBe("NaN");
    });

    test("should handle JSON values that resolve to infinity", () => {
      expect(parseString("1e999") as string).toBe("1e999");
      expect(parseString("-1e999") as string).toBe("-1e999");
    });
  });

  describe("string fallback", () => {
    test("should return original string for unparseable values", () => {
      expect(parseString("hello world") as string).toBe("hello world");
      expect(parseString("123abc") as string).toBe("123abc");
      expect(parseString("true123") as string).toBe("true123");
      expect(parseString("null_value") as string).toBe("null_value");
    });

    test("should handle strings with special characters", () => {
      expect(parseString("hello@world.com") as string).toBe("hello@world.com");
      expect(parseString("$100") as string).toBe("$100");
      expect(parseString("50%") as string).toBe("50%");
      expect(parseString("#tag") as string).toBe("#tag");
    });

    test("should handle multiline strings", () => {
      const multiline = "line1\nline2\nline3";
      expect(parseString(multiline) as string).toBe(multiline);
    });

    test("should handle strings with quotes", () => {
      expect(parseString('say "hello"') as string).toBe('say "hello"');
      expect(parseString("it's working") as string).toBe("it's working");
    });
  });

  describe("edge cases", () => {
    test("should handle whitespace-only strings", () => {
      expect(parseString(" ") as string).toBe(" ");
      expect(parseString("  ") as string).toBe("  ");
      expect(parseString("\t") as string).toBe("\t");
      expect(parseString("\n") as string).toBe("\n");
    });

    test("should handle strings that look like numbers but aren't", () => {
      expect(parseString("123 ") as number).toBe(123);
      expect(parseString(" 123") as number).toBe(123);
      expect(parseString("12.34.56") as string).toBe("12.34.56");
      expect(parseString("12..34") as string).toBe("12..34");
      expect(parseString("--123") as string).toBe("--123");
    });

    test("should handle strings that partially match patterns", () => {
      expect(parseString("truee") as string).toBe("truee");
      expect(parseString("falsee") as string).toBe("falsee");
      expect(parseString("nulll") as string).toBe("nulll");
      expect(parseString("undefinedd") as string).toBe("undefinedd");
    });

    test("should handle Unicode characters", () => {
      expect(parseString("café") as string).toBe("café");
      expect(parseString("数字") as string).toBe("数字");
      expect(parseString("🎉") as string).toBe("🎉");
    });

    test("should handle very long strings", () => {
      const longString = "a".repeat(1000);
      expect(parseString(longString) as string).toBe(longString);
    });
  });

  describe("type inference", () => {
    test("should maintain type inference with generic", () => {
      const numberResult = parseString<number>("123");
      expect(typeof numberResult).toBe("number");
      expect(numberResult).toBe(123);

      const stringResult = parseString<string>("hello");
      expect(typeof stringResult).toBe("string");
      expect(stringResult).toBe("hello");

      const booleanResult = parseString<boolean>("true");
      expect(typeof booleanResult).toBe("boolean");
      expect(booleanResult).toBe(true);
    });
  });

  describe("parametrized tests", () => {
    test.each([
      ["0", 0],
      ["42", 42],
      ["-17", -17],
      ["3.14", 3.14],
      ["-2.5", -2.5],
      ["true", true],
      ["false", false],
      ["null", null],
      ["[1,2,3]", [1, 2, 3]],
      ["{}", {}],
      ['{"a":1}', { a: 1 }],
      ['"text"', "text"],
      ["hello", "hello"],
      ["1e3", 1000],
      ["2.5e-1", 0.25],
    ])("parseString(%s) should return %j", (input, expected) => {
      expect(parseString(input) as unknown).toEqual(expected);
    });
  });

  describe("array splitting edge cases", () => {
    test("should handle arrays with nested brackets", () => {
      expect(parseString('["[test]", "{obj}"]') as string[]).toEqual(["test", "{obj}"]);
    });

    test("should handle arrays with escaped quotes", () => {
      expect(parseString('["\\"hello\\"", "world"]') as string[]).toEqual(['"hello"', "world"]);
    });

    test("should handle deeply nested structures", () => {
      expect(parseString("[[[1,2],[3,4]],[[5,6],[7,8]]]") as number[]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });
  });

  describe("real world examples", () => {
    test("should parse configuration values", () => {
      expect(parseString("3000") as number).toBe(3000);
      expect(parseString("true") as boolean).toBe(true);
      expect(parseString("production") as string).toBe("production");
      expect(parseString('["api", "web", "worker"]') as string[]).toEqual(["api", "web", "worker"]);
    });

    test("should parse environment variables", () => {
      expect(parseString("DEBUG") as string).toBe("DEBUG");
      expect(parseString("1") as number).toBe(1);
      expect(parseString("false") as boolean).toBe(false);
      expect(parseString("null") as null).toBe(null);
    });

    test("should parse URL parameters", () => {
      expect(parseString("page") as string).toBe("page");
      expect(parseString("10") as number).toBe(10);
      expect(parseString("true") as boolean).toBe(true);
      expect(parseString("") as string).toBe("");
    });

    test("should parse form data", () => {
      expect(parseString("John Doe") as string).toBe("John Doe");
      expect(parseString("25") as number).toBe(25);
      expect(parseString("on") as string).toBe("on");
      expect(parseString("false") as boolean).toBe(false);
    });
  });

  describe("performance and consistency", () => {
    test("should handle consecutive calls consistently", () => {
      const input = '{"test": [1, true, null]}';
      const result1 = parseString(input);
      const result2 = parseString(input);
      expect(result1 as unknown).toEqual(result2 as unknown);
      expect(result1 as unknown).toEqual({ test: [1, true, null] });
    });

    test("should not mutate input", () => {
      const input = '{"mutable": false}';
      const originalInput = input;
      const result = parseString(input);
      expect(input).toBe(originalInput);
      expect(result as unknown).toEqual({ mutable: false });
    });

    test("should handle large arrays efficiently", () => {
      const largeArray = `[${Array.from({ length: 100 }, (_, i) => i).join(",")}]`;
      const result = parseString(largeArray) as number[];
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(100);
      expect(result[0]).toBe(0);
      expect(result[99]).toBe(99);
    });
  });
});
