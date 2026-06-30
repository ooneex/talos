import { describe, expect, test } from "bun:test";
import { toSnakeCase } from "@/toSnakeCase";

describe("toSnakeCase", () => {
  describe("basic functionality", () => {
    test("should convert simple lowercase words", () => {
      expect(toSnakeCase("hello world")).toBe("hello_world");
    });

    test("should convert capitalized words", () => {
      expect(toSnakeCase("Hello World")).toBe("hello_world");
    });

    test("should convert single word to lowercase", () => {
      expect(toSnakeCase("hello")).toBe("hello");
    });

    test("should convert single capitalized word to lowercase", () => {
      expect(toSnakeCase("Hello")).toBe("hello");
    });

    test("should handle empty string", () => {
      expect(toSnakeCase("")).toBe("");
    });

    test("should handle whitespace only", () => {
      expect(toSnakeCase("   ")).toBe("");
    });

    test("should convert multiple words", () => {
      expect(toSnakeCase("hello world test")).toBe("hello_world_test");
    });

    test("should handle mixed case input", () => {
      expect(toSnakeCase("HeLLo WoRLd")).toBe("he_l_lo_wo_r_ld");
    });
  });

  describe("already snake_case input", () => {
    test("should handle already snake_case string", () => {
      expect(toSnakeCase("snake_case")).toBe("snake_case");
    });

    test("should handle uppercase snake_case", () => {
      expect(toSnakeCase("SNAKE_CASE")).toBe("snake_case");
    });

    test("should handle complex snake_case", () => {
      expect(toSnakeCase("get_user_profile")).toBe("get_user_profile");
    });

    test("should handle snake_case with numbers", () => {
      expect(toSnakeCase("user_123_profile")).toBe("user_123_profile");
    });

    test("should preserve letters followed by digits in snake_case", () => {
      expect(toSnakeCase("doe_v1")).toBe("doe_v1");
    });
  });

  describe("camelCase conversion", () => {
    test("should convert simple camelCase", () => {
      expect(toSnakeCase("helloWorld")).toBe("hello_world");
    });

    test("should convert multiple camelCase words", () => {
      expect(toSnakeCase("helloWorldTest")).toBe("hello_world_test");
    });

    test("should convert PascalCase", () => {
      expect(toSnakeCase("HelloWorld")).toBe("hello_world");
    });

    test("should convert mixed PascalCase", () => {
      expect(toSnakeCase("HelloWorldTest")).toBe("hello_world_test");
    });

    test("should handle camelCase with numbers", () => {
      expect(toSnakeCase("user123Profile")).toBe("user123_profile");
    });

    test("should handle complex camelCase", () => {
      expect(toSnakeCase("getUserProfileData")).toBe("get_user_profile_data");
    });
  });

  describe("kebab-case conversion", () => {
    test("should convert simple kebab-case", () => {
      expect(toSnakeCase("hello-world")).toBe("hello_world");
    });

    test("should convert multiple kebab-case words", () => {
      expect(toSnakeCase("hello-world-test")).toBe("hello_world_test");
    });

    test("should convert uppercase kebab-case", () => {
      expect(toSnakeCase("HELLO-WORLD")).toBe("hello_world");
    });

    test("should convert mixed case kebab-case", () => {
      expect(toSnakeCase("Hello-World-Test")).toBe("hello_world_test");
    });

    test("should handle leading hyphen", () => {
      expect(toSnakeCase("-hello-world")).toBe("hello_world");
    });

    test("should handle trailing hyphen", () => {
      expect(toSnakeCase("hello-world-")).toBe("hello_world");
    });

    test("should handle multiple hyphens", () => {
      expect(toSnakeCase("hello--world")).toBe("hello_world");
    });
  });

  describe("dot.case conversion", () => {
    test("should convert dot separated words", () => {
      expect(toSnakeCase("hello.world")).toBe("hello_world");
    });

    test("should convert multiple dot separated words", () => {
      expect(toSnakeCase("hello.world.test")).toBe("hello_world_test");
    });

    test("should convert mixed case dot separated", () => {
      expect(toSnakeCase("Hello.World.Test")).toBe("hello_world_test");
    });

    test("should handle leading dot", () => {
      expect(toSnakeCase(".hello.world")).toBe("hello_world");
    });

    test("should handle trailing dot", () => {
      expect(toSnakeCase("hello.world.")).toBe("hello_world");
    });
  });

  describe("numbers handling", () => {
    test("should handle words with numbers", () => {
      expect(toSnakeCase("hello123world")).toBe("hello123_world");
    });

    test("should handle standalone numbers", () => {
      expect(toSnakeCase("hello 123 world")).toBe("hello_123_world");
    });

    test("should handle numbers at start", () => {
      expect(toSnakeCase("123hello")).toBe("123_hello");
    });

    test("should handle version-like patterns", () => {
      expect(toSnakeCase("version2024Update")).toBe("version2024_update");
    });

    test("should handle mixed numbers and letters", () => {
      expect(toSnakeCase("test123ABC456")).toBe("test123_abc456");
    });
  });

  describe("acronyms handling", () => {
    test("should handle simple acronyms", () => {
      expect(toSnakeCase("ID")).toBe("id");
    });

    test("should handle URL acronym", () => {
      expect(toSnakeCase("URL")).toBe("url");
    });

    test("should handle acronym with words", () => {
      expect(toSnakeCase("URLParser")).toBe("url_parser");
    });

    test("should handle multiple acronyms", () => {
      expect(toSnakeCase("HTMLCSS")).toBe("htmlcss");
    });

    test("should handle acronym at end", () => {
      expect(toSnakeCase("parseHTML")).toBe("parse_html");
    });

    test("should handle mixed acronyms and words", () => {
      expect(toSnakeCase("getHTMLFromURL")).toBe("get_html_from_url");
    });

    test("should handle complex acronym patterns", () => {
      expect(toSnakeCase("XMLHttpRequest")).toBe("xml_http_request");
      expect(toSnakeCase("HTTPSConnection")).toBe("https_connection");
      expect(toSnakeCase("HTMLElement")).toBe("html_element");
    });
  });

  describe("mixed separators", () => {
    test("should handle mixed hyphen and underscore", () => {
      expect(toSnakeCase("hello-world_test")).toBe("hello_world_test");
    });

    test("should handle mixed separators with spaces", () => {
      expect(toSnakeCase("hello world-test_case")).toBe("hello_world_test_case");
    });

    test("should handle all separator types", () => {
      expect(toSnakeCase("hello.world-test_case")).toBe("hello_world_test_case");
    });

    test("should handle multiple mixed separators", () => {
      expect(toSnakeCase("hello--world__test  case")).toBe("hello_world_test_case");
    });
  });

  describe("special characters", () => {
    test("should ignore punctuation", () => {
      expect(toSnakeCase("hello, world!")).toBe("hello_world");
    });

    test("should handle parentheses", () => {
      expect(toSnakeCase("hello (world)")).toBe("hello_world");
    });

    test("should handle brackets", () => {
      expect(toSnakeCase("hello [world]")).toBe("hello_world");
    });

    test("should handle braces", () => {
      expect(toSnakeCase("hello {world}")).toBe("hello_world");
    });

    test("should handle quotes", () => {
      expect(toSnakeCase('hello "world"')).toBe("hello_world");
    });

    test("should handle mixed special characters", () => {
      expect(toSnakeCase("hello, (world)! [test]")).toBe("hello_world_test");
    });
  });

  describe("unicode and international characters", () => {
    test("should handle accented characters", () => {
      expect(toSnakeCase("café résumé")).toBe("café_résumé");
    });

    test("should handle cyrillic characters", () => {
      expect(toSnakeCase("привет мир")).toBe("привет_мир");
    });

    test("should handle chinese characters", () => {
      expect(toSnakeCase("你好世界")).toBe("你好世界");
    });

    test("should handle arabic characters", () => {
      expect(toSnakeCase("مرحبا العالم")).toBe("مرحبا_العالم");
    });

    test("should handle mixed latin and unicode", () => {
      expect(toSnakeCase("hello café world")).toBe("hello_café_world");
    });

    test("should handle emoji with text", () => {
      expect(toSnakeCase("hello 😀 world")).toBe("hello_world");
    });
  });

  describe("whitespace handling", () => {
    test("should handle leading whitespace", () => {
      expect(toSnakeCase("   hello world")).toBe("hello_world");
    });

    test("should handle trailing whitespace", () => {
      expect(toSnakeCase("hello world   ")).toBe("hello_world");
    });

    test("should handle multiple spaces", () => {
      expect(toSnakeCase("hello    world")).toBe("hello_world");
    });

    test("should handle tabs", () => {
      expect(toSnakeCase("hello\tworld")).toBe("hello_world");
    });

    test("should handle newlines", () => {
      expect(toSnakeCase("hello\nworld")).toBe("hello_world");
    });

    test("should handle mixed whitespace", () => {
      expect(toSnakeCase("hello \t\n world")).toBe("hello_world");
    });

    test("should handle only whitespace", () => {
      expect(toSnakeCase("   \t\n   ")).toBe("");
    });
  });

  describe("edge cases", () => {
    test("should handle single character", () => {
      expect(toSnakeCase("a")).toBe("a");
    });

    test("should handle single uppercase character", () => {
      expect(toSnakeCase("A")).toBe("a");
    });

    test("should handle single number", () => {
      expect(toSnakeCase("1")).toBe("1");
    });

    test("should handle alternating case input", () => {
      expect(toSnakeCase("aLtErNaTiNg")).toBe("a_lt_er_na_ti_ng");
    });

    test("should handle all uppercase input", () => {
      expect(toSnakeCase("HELLO")).toBe("hello");
    });

    test("should handle all lowercase input", () => {
      expect(toSnakeCase("hello")).toBe("hello");
    });

    test("should handle numbers only", () => {
      expect(toSnakeCase("123456")).toBe("123456");
    });

    test("should handle special characters only", () => {
      expect(toSnakeCase("!!!???")).toBe("");
    });

    test("should handle very short inputs", () => {
      expect(toSnakeCase("ab")).toBe("ab");
      expect(toSnakeCase("AB")).toBe("ab");
      expect(toSnakeCase("aB")).toBe("a_b");
    });
  });

  describe("real-world examples", () => {
    test("should convert JavaScript function names", () => {
      expect(toSnakeCase("getUserProfile")).toBe("get_user_profile");
      expect(toSnakeCase("calculateTotalPrice")).toBe("calculate_total_price");
      expect(toSnakeCase("isAuthenticated")).toBe("is_authenticated");
    });

    test("should convert CSS class names", () => {
      expect(toSnakeCase("btn-primary")).toBe("btn_primary");
      expect(toSnakeCase("nav-bar-item")).toBe("nav_bar_item");
      expect(toSnakeCase("container-fluid")).toBe("container_fluid");
    });

    test("should convert database column names", () => {
      expect(toSnakeCase("createdAt")).toBe("created_at");
      expect(toSnakeCase("updatedAt")).toBe("updated_at");
      expect(toSnakeCase("userId")).toBe("user_id");
    });

    test("should convert API endpoint names", () => {
      expect(toSnakeCase("getUserById")).toBe("get_user_by_id");
      expect(toSnakeCase("createNewPost")).toBe("create_new_post");
      expect(toSnakeCase("deleteComment")).toBe("delete_comment");
    });

    test("should convert file names", () => {
      expect(toSnakeCase("MyComponent.tsx")).toBe("my_component_tsx");
      expect(toSnakeCase("user-service.js")).toBe("user_service_js");
      expect(toSnakeCase("utils.helper.ts")).toBe("utils_helper_ts");
    });

    test("should convert package names", () => {
      expect(toSnakeCase("@my-org/my-package")).toBe("my_org_my_package");
      expect(toSnakeCase("react-router-dom")).toBe("react_router_dom");
      expect(toSnakeCase("lodash.debounce")).toBe("lodash_debounce");
    });

    test("should convert technical terms", () => {
      expect(toSnakeCase("XMLHttpRequest")).toBe("xml_http_request");
      expect(toSnakeCase("JSONParser")).toBe("json_parser");
      expect(toSnakeCase("HTTPSConnection")).toBe("https_connection");
    });
  });

  describe("parametrized tests", () => {
    test.each([
      ["helloWorld", "hello_world"],
      ["HelloWorld", "hello_world"],
      ["hello_world", "hello_world"],
      ["hello-world", "hello_world"],
      ["hello world", "hello_world"],
      ["HELLO_WORLD", "hello_world"],
      ["helloWORLD", "hello_world"],
      ["hello123World", "hello123_world"],
      ["URLParser", "url_parser"],
      ["XMLHttpRequest", "xml_http_request"],
      ["getHTMLElement", "get_html_element"],
      ["parseJSON", "parse_json"],
      ["IOError", "io_error"],
      ["EOF", "eof"],
      ["myHTTP2Server", "my_http2_server"],
      ["version2Update", "version2_update"],
      ["camelCaseString", "camel_case_string"],
      ["PascalCaseString", "pascal_case_string"],
      ["snake_case_string", "snake_case_string"],
      ["kebab-case-string", "kebab_case_string"],
      ["Mixed_case-string", "mixed_case_string"],
      ["mixedCase123String", "mixed_case123_string"],
      ["123StartWithNumber", "123_start_with_number"],
      ["endWithNumber123", "end_with_number123"],
      ["single", "single"],
      ["ALLCAPS", "allcaps"],
      ["a", "a"],
      ["AB", "ab"],
      ["", ""],
    ])("toSnakeCase(%s) should return %s", (input, expected) => {
      expect(toSnakeCase(input)).toBe(expected);
    });
  });

  describe("complex patterns", () => {
    test("should handle complex mixed patterns", () => {
      expect(toSnakeCase("get_USER-profile.Data")).toBe("get_user_profile_data");
    });

    test("should handle version numbers", () => {
      expect(toSnakeCase("v2.0.1")).toBe("v2_0_1");
    });

    test("should handle technical terms with versions", () => {
      expect(toSnakeCase("HTTP2Protocol")).toBe("http2_protocol");
    });

    test("should handle namespace-like patterns", () => {
      expect(toSnakeCase("app.services.userService")).toBe("app_services_user_service");
    });

    test("should handle URL-like patterns", () => {
      expect(toSnakeCase("https://example.com")).toBe("https_example_com");
    });

    test("should handle constant names", () => {
      expect(toSnakeCase("MAX_RETRY_COUNT")).toBe("max_retry_count");
    });

    test("should handle mixed case with numbers and separators", () => {
      expect(toSnakeCase("user_123-ABC.test")).toBe("user_123_abc_test");
    });

    test("should handle complex real-world examples", () => {
      expect(toSnakeCase("HTMLParser2")).toBe("html_parser2");
      expect(toSnakeCase("getElementById")).toBe("get_element_by_id");
      expect(toSnakeCase("XMLHttpRequest")).toBe("xml_http_request");
    });
  });

  describe("function behavior", () => {
    test("should return string type", () => {
      const result = toSnakeCase("test");
      expect(typeof result).toBe("string");
    });

    test("should not mutate input", () => {
      const original = "helloWorld";
      const result = toSnakeCase(original);
      expect(original).toBe("helloWorld");
      expect(result).toBe("hello_world");
    });

    test("should return same result for multiple calls", () => {
      const input = "helloWorld";
      const result1 = toSnakeCase(input);
      const result2 = toSnakeCase(input);
      expect(result1).toBe(result2);
      expect(result1).toBe("hello_world");
    });

    test("should handle very long strings", () => {
      const longString = "thisIsAVeryLongCamelCaseStringThatGoesOnAndOnAndOn".repeat(10);
      const result = toSnakeCase(longString);
      expect(result).toContain("_");
      expect(result).toBe(result.toLowerCase());
    });

    test("should be consistent with dependencies", () => {
      // Verify that the function uses splitToWords correctly
      const inputs = ["helloWorld", "hello-world", "hello_world", "HELLO WORLD"];
      const expected = "hello_world";
      for (const input of inputs) {
        expect(toSnakeCase(input)).toBe(expected);
      }
    });
  });

  describe("performance considerations", () => {
    test("should handle empty input efficiently", () => {
      expect(toSnakeCase("")).toBe("");
    });

    test("should handle whitespace-only input efficiently", () => {
      expect(toSnakeCase("   ")).toBe("");
      expect(toSnakeCase("\t\n  ")).toBe("");
    });

    test("should handle special characters only efficiently", () => {
      expect(toSnakeCase("!!!")).toBe("");
      expect(toSnakeCase("@#$%")).toBe("");
    });

    test("should handle single word efficiently", () => {
      expect(toSnakeCase("hello")).toBe("hello");
      expect(toSnakeCase("HELLO")).toBe("hello");
      expect(toSnakeCase("Hello")).toBe("hello");
    });
  });

  describe("integration with dependencies", () => {
    test("should work correctly with splitToWords edge cases", () => {
      // splitToWords should handle various separators
      expect(toSnakeCase("hello-world_test")).toBe("hello_world_test");
      expect(toSnakeCase("hello.world-test")).toBe("hello_world_test");
      expect(toSnakeCase("hello world-test")).toBe("hello_world_test");
    });

    test("should apply lowercase transformation correctly", () => {
      expect(toSnakeCase("HELLO")).toBe("hello");
      expect(toSnakeCase("HeLLo")).toBe("he_l_lo");
      expect(toSnakeCase("HELLO_WORLD")).toBe("hello_world");
    });

    test("should handle trim behavior correctly", () => {
      expect(toSnakeCase("  hello world  ")).toBe("hello_world");
      expect(toSnakeCase("\thello world\n")).toBe("hello_world");
      expect(toSnakeCase("   ")).toBe("");
    });
  });
});
