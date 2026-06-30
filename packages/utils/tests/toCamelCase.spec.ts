import { describe, expect, test } from "bun:test";
import { toCamelCase } from "@/toCamelCase";

describe("toCamelCase", () => {
  describe("basic functionality", () => {
    test("should convert simple lowercase words", () => {
      expect(toCamelCase("hello world")).toBe("helloWorld");
    });

    test("should convert capitalized words", () => {
      expect(toCamelCase("Hello World")).toBe("helloWorld");
    });

    test("should convert single word to lowercase", () => {
      expect(toCamelCase("hello")).toBe("hello");
    });

    test("should convert single capitalized word to lowercase", () => {
      expect(toCamelCase("Hello")).toBe("hello");
    });

    test("should handle empty string", () => {
      expect(toCamelCase("")).toBe("");
    });

    test("should handle whitespace only", () => {
      expect(toCamelCase("   ")).toBe("");
    });

    test("should convert multiple words", () => {
      expect(toCamelCase("hello world test")).toBe("helloWorldTest");
    });

    test("should handle mixed case input", () => {
      expect(toCamelCase("HeLLo WoRLd")).toBe("heLLoWoRLd");
    });
  });

  describe("already camelCase input", () => {
    test("should handle already camelCase string", () => {
      expect(toCamelCase("camelCase")).toBe("camelCase");
    });

    test("should handle PascalCase string", () => {
      expect(toCamelCase("PascalCase")).toBe("pascalCase");
    });

    test("should handle complex camelCase", () => {
      expect(toCamelCase("getUserProfile")).toBe("getUserProfile");
    });

    test("should handle camelCase with numbers", () => {
      expect(toCamelCase("user123Profile")).toBe("user123Profile");
    });
  });

  describe("snake_case conversion", () => {
    test("should convert simple snake_case", () => {
      expect(toCamelCase("hello_world")).toBe("helloWorld");
    });

    test("should convert multiple snake_case words", () => {
      expect(toCamelCase("hello_world_test")).toBe("helloWorldTest");
    });

    test("should convert uppercase snake_case", () => {
      expect(toCamelCase("HELLO_WORLD")).toBe("helloWorld");
    });

    test("should convert mixed case snake_case", () => {
      expect(toCamelCase("Hello_World_Test")).toBe("helloWorldTest");
    });

    test("should handle leading underscore", () => {
      expect(toCamelCase("_hello_world")).toBe("helloWorld");
    });

    test("should handle trailing underscore", () => {
      expect(toCamelCase("hello_world_")).toBe("helloWorld");
    });

    test("should handle multiple underscores", () => {
      expect(toCamelCase("hello__world")).toBe("helloWorld");
    });
  });

  describe("kebab-case conversion", () => {
    test("should convert simple kebab-case", () => {
      expect(toCamelCase("hello-world")).toBe("helloWorld");
    });

    test("should convert multiple kebab-case words", () => {
      expect(toCamelCase("hello-world-test")).toBe("helloWorldTest");
    });

    test("should convert uppercase kebab-case", () => {
      expect(toCamelCase("HELLO-WORLD")).toBe("helloWorld");
    });

    test("should convert mixed case kebab-case", () => {
      expect(toCamelCase("Hello-World-Test")).toBe("helloWorldTest");
    });

    test("should handle leading hyphen", () => {
      expect(toCamelCase("-hello-world")).toBe("helloWorld");
    });

    test("should handle trailing hyphen", () => {
      expect(toCamelCase("hello-world-")).toBe("helloWorld");
    });

    test("should handle multiple hyphens", () => {
      expect(toCamelCase("hello--world")).toBe("helloWorld");
    });
  });

  describe("dot.case conversion", () => {
    test("should convert dot separated words", () => {
      expect(toCamelCase("hello.world")).toBe("helloWorld");
    });

    test("should convert multiple dot separated words", () => {
      expect(toCamelCase("hello.world.test")).toBe("helloWorldTest");
    });

    test("should convert mixed case dot separated", () => {
      expect(toCamelCase("Hello.World.Test")).toBe("helloWorldTest");
    });

    test("should handle leading dot", () => {
      expect(toCamelCase(".hello.world")).toBe("helloWorld");
    });

    test("should handle trailing dot", () => {
      expect(toCamelCase("hello.world.")).toBe("helloWorld");
    });
  });

  describe("numbers handling", () => {
    test("should handle words with numbers", () => {
      expect(toCamelCase("hello123 world456")).toBe("hello123World456");
    });

    test("should handle standalone numbers", () => {
      expect(toCamelCase("hello 123 world")).toBe("hello123World");
    });

    test("should handle numbers at start", () => {
      expect(toCamelCase("123 hello world")).toBe("123HelloWorld");
    });

    test("should handle version-like patterns", () => {
      expect(toCamelCase("version 1.2.3")).toBe("version123");
    });

    test("should handle mixed numbers and letters", () => {
      expect(toCamelCase("user123 profile456 test")).toBe("user123Profile456Test");
    });
  });

  describe("acronyms handling", () => {
    test("should handle simple acronyms", () => {
      expect(toCamelCase("ID")).toBe("id");
    });

    test("should handle URL acronym", () => {
      expect(toCamelCase("URL")).toBe("url");
    });

    test("should handle acronym with words", () => {
      expect(toCamelCase("HTML Element")).toBe("htmlElement");
    });

    test("should handle multiple acronyms", () => {
      expect(toCamelCase("HTTP API")).toBe("httpApi");
    });

    test("should handle acronym at end", () => {
      expect(toCamelCase("parse XML")).toBe("parseXml");
    });

    test("should handle mixed acronyms and words", () => {
      expect(toCamelCase("XML Http Request")).toBe("xmlHttpRequest");
    });

    test("should handle complex acronym patterns", () => {
      expect(toCamelCase("XMLParser")).toBe("xmlParser");
      expect(toCamelCase("HTTPApi")).toBe("httpApi");
      expect(toCamelCase("JSONData")).toBe("jsonData");
    });
  });

  describe("mixed separators", () => {
    test("should handle mixed hyphen and underscore", () => {
      expect(toCamelCase("hello-world_test")).toBe("helloWorldTest");
    });

    test("should handle mixed separators with spaces", () => {
      expect(toCamelCase("hello-world test_case")).toBe("helloWorldTestCase");
    });

    test("should handle all separator types", () => {
      expect(toCamelCase("hello-world_test.case api")).toBe("helloWorldTestCaseApi");
    });

    test("should handle multiple mixed separators", () => {
      expect(toCamelCase("hello--world__test..case")).toBe("helloWorldTestCase");
    });
  });

  describe("special characters", () => {
    test("should ignore punctuation", () => {
      expect(toCamelCase("hello, world!")).toBe("helloWorld");
    });

    test("should handle parentheses", () => {
      expect(toCamelCase("hello(world)")).toBe("helloWorld");
    });

    test("should handle brackets", () => {
      expect(toCamelCase("hello[world]")).toBe("helloWorld");
    });

    test("should handle braces", () => {
      expect(toCamelCase("hello{world}")).toBe("helloWorld");
    });

    test("should handle quotes", () => {
      expect(toCamelCase("'hello' \"world\"")).toBe("helloWorld");
    });

    test("should handle mixed special characters", () => {
      expect(toCamelCase("hello@#$%world^&*test")).toBe("helloWorldTest");
    });
  });

  describe("unicode and international characters", () => {
    test("should handle accented characters", () => {
      expect(toCamelCase("café résumé")).toBe("caféRésumé");
    });

    test("should handle cyrillic characters", () => {
      expect(toCamelCase("привет мир")).toBe("приветМир");
    });

    test("should handle chinese characters", () => {
      expect(toCamelCase("你好 世界")).toBe("你好世界");
    });

    test("should handle arabic characters", () => {
      expect(toCamelCase("مرحبا بالعالم")).toBe("مرحبابالعالم");
    });

    test("should handle mixed latin and unicode", () => {
      expect(toCamelCase("hello 世界")).toBe("hello世界");
    });

    test("should handle emoji with text", () => {
      expect(toCamelCase("hello 😀 world")).toBe("helloWorld");
    });
  });

  describe("whitespace handling", () => {
    test("should handle leading whitespace", () => {
      expect(toCamelCase("  hello world")).toBe("helloWorld");
    });

    test("should handle trailing whitespace", () => {
      expect(toCamelCase("hello world  ")).toBe("helloWorld");
    });

    test("should handle multiple spaces", () => {
      expect(toCamelCase("hello    world")).toBe("helloWorld");
    });

    test("should handle tabs", () => {
      expect(toCamelCase("hello\tworld")).toBe("helloWorld");
    });

    test("should handle newlines", () => {
      expect(toCamelCase("hello\nworld")).toBe("helloWorld");
    });

    test("should handle mixed whitespace", () => {
      expect(toCamelCase("  hello \t world \n test  ")).toBe("helloWorldTest");
    });

    test("should handle only whitespace", () => {
      expect(toCamelCase("   \t\n   ")).toBe("");
    });
  });

  describe("edge cases", () => {
    test("should handle single character", () => {
      expect(toCamelCase("a")).toBe("a");
    });

    test("should handle single uppercase character", () => {
      expect(toCamelCase("A")).toBe("a");
    });

    test("should handle single number", () => {
      expect(toCamelCase("1")).toBe("1");
    });

    test("should handle alternating case input", () => {
      expect(toCamelCase("aBcDeFg")).toBe("aBcDeFg");
    });

    test("should handle all uppercase input", () => {
      expect(toCamelCase("HELLO")).toBe("hello");
    });

    test("should handle all lowercase input", () => {
      expect(toCamelCase("hello")).toBe("hello");
    });

    test("should handle numbers only", () => {
      expect(toCamelCase("123456")).toBe("123456");
    });

    test("should handle special characters only", () => {
      expect(toCamelCase("!@#$%^&*()")).toBe("");
    });

    test("should handle very short inputs", () => {
      expect(toCamelCase("a b")).toBe("aB");
      expect(toCamelCase("A B")).toBe("aB");
      expect(toCamelCase("1 2")).toBe("12");
    });
  });

  describe("real-world examples", () => {
    test("should convert JavaScript function names", () => {
      expect(toCamelCase("get element by id")).toBe("getElementById");
      expect(toCamelCase("add event listener")).toBe("addEventListener");
      expect(toCamelCase("query selector")).toBe("querySelector");
    });

    test("should convert CSS class names", () => {
      expect(toCamelCase("btn-primary")).toBe("btnPrimary");
      expect(toCamelCase("form-control")).toBe("formControl");
      expect(toCamelCase("navbar-brand")).toBe("navbarBrand");
    });

    test("should convert database column names", () => {
      expect(toCamelCase("user_id")).toBe("userId");
      expect(toCamelCase("created_at")).toBe("createdAt");
      expect(toCamelCase("first_name")).toBe("firstName");
    });

    test("should convert API endpoint names", () => {
      expect(toCamelCase("get user by id")).toBe("getUserById");
      expect(toCamelCase("create user profile")).toBe("createUserProfile");
      expect(toCamelCase("update password")).toBe("updatePassword");
    });

    test("should convert file names", () => {
      expect(toCamelCase("my-file.txt")).toBe("myFileTxt");
      expect(toCamelCase("user_profile.json")).toBe("userProfileJson");
      expect(toCamelCase("config-dev.yaml")).toBe("configDevYaml");
    });

    test("should convert package names", () => {
      expect(toCamelCase("react-dom")).toBe("reactDom");
      expect(toCamelCase("lodash.get")).toBe("lodashGet");
      expect(toCamelCase("@types/node")).toBe("typesNode");
    });

    test("should convert technical terms", () => {
      expect(toCamelCase("XML Http Request")).toBe("xmlHttpRequest");
      expect(toCamelCase("JSON Web Token")).toBe("jsonWebToken");
      expect(toCamelCase("REST API")).toBe("restApi");
    });
  });

  describe("parametrized tests", () => {
    test.each([
      ["hello world", "helloWorld"],
      ["Hello World", "helloWorld"],
      ["HELLO WORLD", "helloWorld"],
      ["hello-world", "helloWorld"],
      ["hello_world", "helloWorld"],
      ["hello.world", "helloWorld"],
      ["helloWorld", "helloWorld"],
      ["HelloWorld", "helloWorld"],
      ["hello", "hello"],
      ["Hello", "hello"],
      ["HELLO", "hello"],
      ["hello123", "hello123"],
      ["123hello", "123Hello"],
      ["XMLParser", "xmlParser"],
      ["parseXML", "parseXml"],
      ["HTML5", "html5"],
      ["getUserById", "getUserById"],
      ["user_id", "userId"],
      ["API", "api"],
      ["", ""],
      ["   ", ""],
      ["a", "a"],
      ["A", "a"],
      ["1", "1"],
      ["hello world test", "helloWorldTest"],
      ["HELLO_WORLD_TEST", "helloWorldTest"],
      ["hello-world-test", "helloWorldTest"],
      ["hello.world.test", "helloWorldTest"],
    ])("toCamelCase(%s) should return %s", (input, expected) => {
      expect(toCamelCase(input)).toBe(expected);
    });
  });

  describe("complex patterns", () => {
    test("should handle complex mixed patterns", () => {
      expect(toCamelCase("parse HTML5 Document")).toBe("parseHtml5Document");
    });

    test("should handle version numbers", () => {
      expect(toCamelCase("v1.2.3-beta")).toBe("v123Beta");
    });

    test("should handle technical terms with versions", () => {
      expect(toCamelCase("XMLHttpRequestV2")).toBe("xmlHttpRequestV2");
    });

    test("should handle namespace-like patterns", () => {
      expect(toCamelCase("com.example.MyClass")).toBe("comExampleMyClass");
    });

    test("should handle URL-like patterns", () => {
      expect(toCamelCase("http API Server")).toBe("httpApiServer");
    });

    test("should handle constant names", () => {
      expect(toCamelCase("MAX_USER_COUNT")).toBe("maxUserCount");
    });

    test("should handle mixed case with numbers and separators", () => {
      expect(toCamelCase("iPhone14-Pro_Max")).toBe("iPhone14ProMax");
    });

    test("should handle complex real-world examples", () => {
      expect(toCamelCase("XMLHttpRequest-v2.0_beta")).toBe("xmlHttpRequestV20Beta");
      expect(toCamelCase("getUserProfile_byId-V3")).toBe("getUserProfileByIdV3");
      expect(toCamelCase("API_KEY_VERSION_2")).toBe("apiKeyVersion2");
    });
  });

  describe("function behavior", () => {
    test("should return string type", () => {
      const result = toCamelCase("test");
      expect(typeof result).toBe("string");
    });

    test("should not mutate input", () => {
      const original = "hello world";
      const result = toCamelCase(original);
      expect(original).toBe("hello world");
      expect(result).toBe("helloWorld");
    });

    test("should return same result for multiple calls", () => {
      const input = "hello world";
      const result1 = toCamelCase(input);
      const result2 = toCamelCase(input);
      expect(result1).toBe(result2);
      expect(result1).toBe("helloWorld");
    });

    test("should handle very long strings", () => {
      const longString = `${"hello ".repeat(1000)}world`;
      const result = toCamelCase(longString);
      expect(result).toMatch(/^hello/);
      expect(result).toMatch(/World$/);
      expect(result).not.toContain(" ");
    });

    test("should be consistent with dependencies", () => {
      // Test consistency with splitToWords and capitalizeWord behavior
      expect(toCamelCase("XMLParser")).toBe("xmlParser");
      expect(toCamelCase("parseXML")).toBe("parseXml");
      expect(toCamelCase("HTMLElement")).toBe("htmlElement");
    });
  });

  describe("performance considerations", () => {
    test("should handle empty input efficiently", () => {
      expect(toCamelCase("")).toBe("");
    });

    test("should handle whitespace-only input efficiently", () => {
      expect(toCamelCase("   \n\t  ")).toBe("");
    });

    test("should handle special characters only efficiently", () => {
      expect(toCamelCase("!@#$%^&*()_+-=[]{}|;:,.<>?")).toBe("");
    });

    test("should handle single word efficiently", () => {
      expect(toCamelCase("hello")).toBe("hello");
      expect(toCamelCase("Hello")).toBe("hello");
      expect(toCamelCase("HELLO")).toBe("hello");
    });
  });

  describe("integration with dependencies", () => {
    test("should work correctly with splitToWords edge cases", () => {
      // Test cases that rely heavily on splitToWords behavior
      expect(toCamelCase("XMLHttpRequest")).toBe("xmlHttpRequest");
      expect(toCamelCase("parseHTML5Document")).toBe("parseHtml5Document");
      expect(toCamelCase("getUserProfile123")).toBe("getUserProfile123");
    });

    test("should work correctly with capitalizeWord edge cases", () => {
      // Test cases that rely heavily on capitalizeWord behavior
      expect(toCamelCase("hello world")).toBe("helloWorld");
      expect(toCamelCase("HELLO WORLD")).toBe("helloWorld");
      expect(toCamelCase("café résumé")).toBe("caféRésumé");
    });

    test("should handle trim behavior correctly", () => {
      expect(toCamelCase("  hello world  ")).toBe("helloWorld");
      expect(toCamelCase("\t\nhello world\t\n")).toBe("helloWorld");
      expect(toCamelCase("   ")).toBe("");
    });
  });
});
