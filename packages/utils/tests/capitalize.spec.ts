import { describe, expect, test } from "bun:test";
import { capitalize } from "@/capitalize";

describe("capitalize", () => {
  describe("basic functionality", () => {
    test("should capitalize first letter of lowercase word", () => {
      expect(capitalize("hello")).toBe("Hello");
    });

    test("should capitalize first letter and lowercase the rest", () => {
      expect(capitalize("hELLO")).toBe("Hello");
    });

    test("should handle single character", () => {
      expect(capitalize("a")).toBe("A");
    });

    test("should handle uppercase single character", () => {
      expect(capitalize("A")).toBe("A");
    });

    test("should handle already capitalized word", () => {
      expect(capitalize("Hello")).toBe("Hello");
    });

    test("should handle mixed case word", () => {
      expect(capitalize("hElLo")).toBe("Hello");
    });
  });

  describe("edge cases", () => {
    test("should return empty string when input is empty", () => {
      expect(capitalize("")).toBe("");
    });

    test("should handle words with numbers", () => {
      expect(capitalize("hello123")).toBe("Hello123");
    });

    test("should handle words starting with numbers", () => {
      expect(capitalize("123hello")).toBe("123hello");
    });

    test("should handle special characters", () => {
      expect(capitalize("!hello")).toBe("!hello");
    });

    test("should handle words with special characters", () => {
      expect(capitalize("hello-world")).toBe("Hello-world");
    });

    test("should handle accented characters", () => {
      expect(capitalize("école")).toBe("École");
    });

    test("should handle non-latin characters", () => {
      expect(capitalize("привет")).toBe("Привет");
    });
  });

  describe("whitespace handling", () => {
    test("should handle words with leading spaces", () => {
      expect(capitalize(" hello")).toBe(" hello");
    });

    test("should handle words with trailing spaces", () => {
      expect(capitalize("hello ")).toBe("Hello ");
    });

    test("should handle single space", () => {
      expect(capitalize(" ")).toBe(" ");
    });

    test("should handle multiple spaces", () => {
      expect(capitalize("   ")).toBe("   ");
    });

    test("should handle tab character", () => {
      expect(capitalize("\t")).toBe("\t");
    });

    test("should handle newline character", () => {
      expect(capitalize("\n")).toBe("\n");
    });
  });

  describe("parametrized tests", () => {
    test.each([
      ["word", "Word"],
      ["WORD", "Word"],
      ["wORD", "Word"],
      ["test", "Test"],
      ["javascript", "Javascript"],
      ["typescript", "Typescript"],
      ["react", "React"],
    ])("capitalize(%s) should return %s", (input, expected) => {
      expect(capitalize(input)).toBe(expected);
    });
  });

  describe("type safety", () => {
    test("should handle very long strings", () => {
      const longString = "a".repeat(1000);
      const result = capitalize(longString);
      expect(result).toHaveLength(1000);
      expect(result[0]).toBe("A");
      expect(result.slice(1)).toBe("a".repeat(999));
    });

    test("should handle unicode characters", () => {
      expect(capitalize("émile")).toBe("Émile");
      expect(capitalize("ñoño")).toBe("Ñoño");
      expect(capitalize("café")).toBe("Café");
    });

    test("should handle emoji", () => {
      expect(capitalize("😀hello")).toBe("😀hello");
      expect(capitalize("hello😀")).toBe("Hello😀");
    });
  });

  describe("function behavior", () => {
    test("should not mutate original string", () => {
      const original = "hello";
      const result = capitalize(original);
      expect(original).toBe("hello");
      expect(result).toBe("Hello");
    });

    test("should return string type", () => {
      const result = capitalize("test");
      expect(typeof result).toBe("string");
    });

    test("should handle consecutive calls consistently", () => {
      const word = "hello";
      const result1 = capitalize(word);
      const result2 = capitalize(word);
      expect(result1).toBe(result2);
      expect(result1).toBe("Hello");
    });
  });

  describe("real world examples", () => {
    test("should capitalize common names", () => {
      expect(capitalize("john")).toBe("John");
      expect(capitalize("mary")).toBe("Mary");
      expect(capitalize("david")).toBe("David");
    });

    test("should handle programming terms", () => {
      expect(capitalize("function")).toBe("Function");
      expect(capitalize("variable")).toBe("Variable");
      expect(capitalize("method")).toBe("Method");
    });

    test("should handle common words", () => {
      expect(capitalize("the")).toBe("The");
      expect(capitalize("and")).toBe("And");
      expect(capitalize("but")).toBe("But");
    });
  });
});
