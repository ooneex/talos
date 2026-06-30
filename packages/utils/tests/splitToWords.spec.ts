import { describe, expect, test } from "bun:test";
import { splitToWords } from "@/splitToWords";

describe("splitToWords", () => {
  describe("basic functionality", () => {
    test("should split simple lowercase words", () => {
      expect(splitToWords("hello world")).toEqual(["hello", "world"]);
    });

    test("should split capitalized words", () => {
      expect(splitToWords("Hello World")).toEqual(["Hello", "World"]);
    });

    test("should split single word", () => {
      expect(splitToWords("hello")).toEqual(["hello"]);
    });

    test("should split capitalized single word", () => {
      expect(splitToWords("Hello")).toEqual(["Hello"]);
    });

    test("should handle empty string", () => {
      expect(splitToWords("")).toEqual([]);
    });

    test("should handle whitespace only", () => {
      expect(splitToWords("   ")).toEqual([]);
    });
  });

  describe("camelCase and PascalCase", () => {
    test("should split camelCase", () => {
      expect(splitToWords("camelCase")).toEqual(["camel", "Case"]);
    });

    test("should split PascalCase", () => {
      expect(splitToWords("PascalCase")).toEqual(["Pascal", "Case"]);
    });

    test("should split complex camelCase", () => {
      expect(splitToWords("getUserProfile")).toEqual(["get", "User", "Profile"]);
    });

    test("should split camelCase with numbers", () => {
      expect(splitToWords("user123Profile")).toEqual(["user123", "Profile"]);
    });

    test("should split camelCase starting with number", () => {
      expect(splitToWords("123userProfile")).toEqual(["123", "user", "Profile"]);
    });
  });

  describe("acronyms", () => {
    test("should handle simple acronyms", () => {
      expect(splitToWords("ID")).toEqual(["ID"]);
    });

    test("should handle URL acronym", () => {
      expect(splitToWords("URL")).toEqual(["URL"]);
    });

    test("should handle acronym followed by capitalized word", () => {
      expect(splitToWords("HTMLElement")).toEqual(["HTML", "Element"]);
    });

    test("should handle acronym followed by lowercase", () => {
      expect(splitToWords("XMLparser")).toEqual(["XM", "Lparser"]);
    });

    test("should handle multiple acronyms", () => {
      expect(splitToWords("HTTPAPI")).toEqual(["HTTPAPI"]);
    });

    test("should handle acronym at end", () => {
      expect(splitToWords("parseXML")).toEqual(["parse", "XML"]);
    });

    test("should handle mixed acronyms and words", () => {
      expect(splitToWords("XMLHttpRequest")).toEqual(["XML", "Http", "Request"]);
    });

    test("should handle acronym patterns correctly", () => {
      expect(splitToWords("XMLParser")).toEqual(["XML", "Parser"]);
      expect(splitToWords("HTTPApi")).toEqual(["HTTP", "Api"]);
      expect(splitToWords("JSONData")).toEqual(["JSON", "Data"]);
    });

    test("should handle all caps followed by lowercase as expected", () => {
      expect(splitToWords("XMLparser")).toEqual(["XM", "Lparser"]);
      expect(splitToWords("HTMLdocument")).toEqual(["HTM", "Ldocument"]);
    });
  });

  describe("numbers", () => {
    test("should extract standalone numbers", () => {
      expect(splitToWords("123")).toEqual(["123"]);
    });

    test("should extract multiple numbers", () => {
      expect(splitToWords("123 456")).toEqual(["123", "456"]);
    });

    test("should split words and numbers", () => {
      expect(splitToWords("hello123world")).toEqual(["hello123", "world"]);
    });

    test("should handle decimal-like patterns", () => {
      expect(splitToWords("version1.2.3")).toEqual(["version1", "2", "3"]);
    });

    test("should handle large numbers", () => {
      expect(splitToWords("year2024")).toEqual(["year2024"]);
    });
  });

  describe("special characters and separators", () => {
    test("should ignore hyphens as separators", () => {
      expect(splitToWords("hello-world")).toEqual(["hello", "world"]);
    });

    test("should ignore underscores as separators", () => {
      expect(splitToWords("hello_world")).toEqual(["hello", "world"]);
    });

    test("should ignore dots as separators", () => {
      expect(splitToWords("hello.world")).toEqual(["hello", "world"]);
    });

    test("should ignore multiple special characters", () => {
      expect(splitToWords("hello-_-world")).toEqual(["hello", "world"]);
    });

    test("should handle mixed separators", () => {
      expect(splitToWords("hello-world_test.case")).toEqual(["hello", "world", "test", "case"]);
    });

    test("should ignore punctuation", () => {
      expect(splitToWords("hello, world!")).toEqual(["hello", "world"]);
    });

    test("should handle parentheses", () => {
      expect(splitToWords("hello(world)")).toEqual(["hello", "world"]);
    });

    test("should handle brackets", () => {
      expect(splitToWords("hello[world]")).toEqual(["hello", "world"]);
    });
  });

  describe("unicode and international characters", () => {
    test("should handle accented characters", () => {
      expect(splitToWords("café résumé")).toEqual(["café", "résumé"]);
    });

    test("should handle cyrillic characters", () => {
      expect(splitToWords("привет мир")).toEqual(["привет", "мир"]);
    });

    test("should handle chinese characters", () => {
      expect(splitToWords("你好世界")).toEqual(["你好世界"]);
    });

    test("should handle arabic characters", () => {
      expect(splitToWords("مرحبا بالعالم")).toEqual(["مرحبا", "بالعالم"]);
    });

    test("should handle mixed latin and unicode", () => {
      expect(splitToWords("hello世界")).toEqual(["hello", "世界"]);
    });

    test("should handle emoji mixed with text", () => {
      expect(splitToWords("hello😀world")).toEqual(["hello", "world"]);
    });
  });

  describe("edge cases", () => {
    test("should handle single character", () => {
      expect(splitToWords("a")).toEqual(["a"]);
    });

    test("should handle single uppercase character", () => {
      expect(splitToWords("A")).toEqual(["A"]);
    });

    test("should handle single number", () => {
      expect(splitToWords("1")).toEqual(["1"]);
    });

    test("should handle alternating case", () => {
      expect(splitToWords("aBcDeFg")).toEqual(["a", "Bc", "De", "Fg"]);
    });

    test("should handle all uppercase", () => {
      expect(splitToWords("HELLO")).toEqual(["HELLO"]);
    });

    test("should handle all lowercase", () => {
      expect(splitToWords("hello")).toEqual(["hello"]);
    });

    test("should handle numbers only", () => {
      expect(splitToWords("123456")).toEqual(["123456"]);
    });

    test("should handle mixed special characters only", () => {
      expect(splitToWords("!@#$%^&*()")).toEqual([]);
    });
  });

  describe("real-world examples", () => {
    test("should split JavaScript variable names", () => {
      expect(splitToWords("getElementById")).toEqual(["get", "Element", "By", "Id"]);
      expect(splitToWords("addEventListener")).toEqual(["add", "Event", "Listener"]);
      expect(splitToWords("querySelector")).toEqual(["query", "Selector"]);
    });

    test("should split CSS class names", () => {
      expect(splitToWords("btn-primary")).toEqual(["btn", "primary"]);
      expect(splitToWords("form-control")).toEqual(["form", "control"]);
      expect(splitToWords("navbar-brand")).toEqual(["navbar", "brand"]);
    });

    test("should split file names", () => {
      expect(splitToWords("myFile.txt")).toEqual(["my", "File", "txt"]);
      expect(splitToWords("user_profile.json")).toEqual(["user", "profile", "json"]);
      expect(splitToWords("config-dev.yaml")).toEqual(["config", "dev", "yaml"]);
    });

    test("should split API endpoints", () => {
      expect(splitToWords("getUserById")).toEqual(["get", "User", "By", "Id"]);
      expect(splitToWords("createUserProfile")).toEqual(["create", "User", "Profile"]);
      expect(splitToWords("updatePasswordV2")).toEqual(["update", "Password", "V2"]);
    });

    test("should split database column names", () => {
      expect(splitToWords("user_id")).toEqual(["user", "id"]);
      expect(splitToWords("created_at")).toEqual(["created", "at"]);
      expect(splitToWords("firstName")).toEqual(["first", "Name"]);
    });

    test("should split package names", () => {
      expect(splitToWords("react-dom")).toEqual(["react", "dom"]);
      expect(splitToWords("lodash.get")).toEqual(["lodash", "get"]);
      expect(splitToWords("@types/node")).toEqual(["types", "node"]);
    });
  });

  describe("complex patterns", () => {
    test("should handle complex mixed patterns", () => {
      expect(splitToWords("parseHTML5Document")).toEqual(["parse", "HTML5", "Document"]);
    });

    test("should handle version numbers", () => {
      expect(splitToWords("v1.2.3-beta")).toEqual(["v1", "2", "3", "beta"]);
    });

    test("should handle technical terms", () => {
      expect(splitToWords("XMLHttpRequestV2")).toEqual(["XML", "Http", "Request", "V2"]);
    });

    test("should handle namespace-like patterns", () => {
      expect(splitToWords("com.example.MyClass")).toEqual(["com", "example", "My", "Class"]);
    });

    test("should handle URL-like patterns", () => {
      expect(splitToWords("httpAPIServer")).toEqual(["http", "API", "Server"]);
    });

    test("should handle constant names", () => {
      expect(splitToWords("MAX_USER_COUNT")).toEqual(["MAX", "USER", "COUNT"]);
    });

    test("should handle mixed case with numbers", () => {
      expect(splitToWords("iPhone14Pro")).toEqual(["i", "Phone14", "Pro"]);
    });

    test("should handle edge case acronym patterns", () => {
      expect(splitToWords("APIKey")).toEqual(["API", "Key"]);
      expect(splitToWords("URLPath")).toEqual(["URL", "Path"]);
      expect(splitToWords("IDField")).toEqual(["ID", "Field"]);
    });
  });

  describe("parametrized tests", () => {
    test.each([
      ["hello", ["hello"]],
      ["Hello", ["Hello"]],
      ["HELLO", ["HELLO"]],
      ["helloWorld", ["hello", "World"]],
      ["HelloWorld", ["Hello", "World"]],
      ["hello_world", ["hello", "world"]],
      ["hello-world", ["hello", "world"]],
      ["hello123", ["hello123"]],
      ["123hello", ["123", "hello"]],
      ["XMLParser", ["XML", "Parser"]],
      ["parseXML", ["parse", "XML"]],
      ["HTML5", ["HTML5"]],
      ["getUserById", ["get", "User", "By", "Id"]],
      ["user_id", ["user", "id"]],
      ["API", ["API"]],
    ])("splitToWords(%s) should return %j", (input, expected) => {
      expect(splitToWords(input) as unknown).toEqual(expected);
    });
  });

  describe("function behavior", () => {
    test("should return array", () => {
      const result = splitToWords("test");
      expect(Array.isArray(result)).toBe(true);
    });

    test("should not mutate input", () => {
      const original = "helloWorld";
      const result = splitToWords(original);
      expect(original).toBe("helloWorld");
      expect(result).toEqual(["hello", "World"]);
    });

    test("should return new array each time", () => {
      const result1 = splitToWords("hello");
      const result2 = splitToWords("hello");
      expect(result1).not.toBe(result2);
      expect(result1).toEqual(result2);
    });

    test("should handle very long strings", () => {
      const longString = `${"a".repeat(1000)}B${"c".repeat(1000)}`;
      const result = splitToWords(longString);
      expect(result).toHaveLength(2);
      expect(result[0]).toBe("a".repeat(1000));
      expect(result[1]).toBe(`B${"c".repeat(1000)}`);
    });

    test("should be consistent across multiple calls", () => {
      const input = "complexTestCase123";
      const result1 = splitToWords(input);
      const result2 = splitToWords(input);
      const result3 = splitToWords(input);

      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
      expect(result1).toEqual(["complex", "Test", "Case123"]);
    });
  });

  describe("performance considerations", () => {
    test("should handle empty input efficiently", () => {
      expect(splitToWords("")).toEqual([]);
    });

    test("should handle whitespace-only input efficiently", () => {
      expect(splitToWords("   \n\t  ")).toEqual([]);
    });

    test("should handle special characters only efficiently", () => {
      expect(splitToWords("!@#$%^&*()_+-=[]{}|;:,.<>?")).toEqual([]);
    });
  });
});
