import { describe, expect, test } from "bun:test";
import { toKebabCase } from "@/toKebabCase";

describe("toKebabCase", () => {
  describe("basic functionality", () => {
    test("should convert simple lowercase words", () => {
      expect(toKebabCase("hello world")).toBe("hello-world");
    });

    test("should convert capitalized words", () => {
      expect(toKebabCase("Hello World")).toBe("hello-world");
    });

    test("should convert single word to lowercase", () => {
      expect(toKebabCase("hello")).toBe("hello");
    });

    test("should convert single capitalized word to lowercase", () => {
      expect(toKebabCase("Hello")).toBe("hello");
    });

    test("should handle empty string", () => {
      expect(toKebabCase("")).toBe("");
    });

    test("should handle whitespace only", () => {
      expect(toKebabCase("   ")).toBe("");
    });

    test("should convert multiple words", () => {
      expect(toKebabCase("hello world test")).toBe("hello-world-test");
    });

    test("should handle mixed case input", () => {
      expect(toKebabCase("HeLLo WoRLd")).toBe("he-l-lo-wo-r-ld");
    });
  });

  describe("camelCase and PascalCase conversion", () => {
    test("should convert camelCase string", () => {
      expect(toKebabCase("camelCase")).toBe("camel-case");
    });

    test("should convert PascalCase string", () => {
      expect(toKebabCase("PascalCase")).toBe("pascal-case");
    });

    test("should convert complex camelCase", () => {
      expect(toKebabCase("getUserProfile")).toBe("get-user-profile");
    });

    test("should convert camelCase with numbers", () => {
      expect(toKebabCase("user123Profile")).toBe("user123-profile");
    });

    test("should handle single camelCase word", () => {
      expect(toKebabCase("hello")).toBe("hello");
    });

    test("should handle alternating case", () => {
      expect(toKebabCase("aBcDeFg")).toBe("a-bc-de-fg");
    });
  });

  describe("snake_case conversion", () => {
    test("should convert simple snake_case", () => {
      expect(toKebabCase("hello_world")).toBe("hello-world");
    });

    test("should convert multiple snake_case words", () => {
      expect(toKebabCase("hello_world_test")).toBe("hello-world-test");
    });

    test("should convert uppercase snake_case", () => {
      expect(toKebabCase("HELLO_WORLD")).toBe("hello-world");
    });

    test("should convert mixed case snake_case", () => {
      expect(toKebabCase("Hello_World_Test")).toBe("hello-world-test");
    });

    test("should handle leading underscore", () => {
      expect(toKebabCase("_hello_world")).toBe("hello-world");
    });

    test("should handle trailing underscore", () => {
      expect(toKebabCase("hello_world_")).toBe("hello-world");
    });

    test("should handle multiple underscores", () => {
      expect(toKebabCase("hello__world")).toBe("hello-world");
    });
  });

  describe("already kebab-case conversion", () => {
    test("should handle simple kebab-case", () => {
      expect(toKebabCase("hello-world")).toBe("hello-world");
    });

    test("should convert uppercase kebab-case", () => {
      expect(toKebabCase("HELLO-WORLD")).toBe("hello-world");
    });

    test("should convert mixed case kebab-case", () => {
      expect(toKebabCase("Hello-World-Test")).toBe("hello-world-test");
    });

    test("should handle leading hyphen", () => {
      expect(toKebabCase("-hello-world")).toBe("hello-world");
    });

    test("should handle trailing hyphen", () => {
      expect(toKebabCase("hello-world-")).toBe("hello-world");
    });

    test("should handle multiple hyphens", () => {
      expect(toKebabCase("hello--world")).toBe("hello-world");
    });
  });

  describe("dot.case conversion", () => {
    test("should convert dot separated words", () => {
      expect(toKebabCase("hello.world")).toBe("hello-world");
    });

    test("should convert multiple dot separated words", () => {
      expect(toKebabCase("hello.world.test")).toBe("hello-world-test");
    });

    test("should convert mixed case dot separated", () => {
      expect(toKebabCase("Hello.World.Test")).toBe("hello-world-test");
    });

    test("should handle leading dot", () => {
      expect(toKebabCase(".hello.world")).toBe("hello-world");
    });

    test("should handle trailing dot", () => {
      expect(toKebabCase("hello.world.")).toBe("hello-world");
    });
  });

  describe("numbers handling", () => {
    test("should handle words with numbers", () => {
      expect(toKebabCase("hello123 world456")).toBe("hello123-world456");
    });

    test("should handle standalone numbers", () => {
      expect(toKebabCase("hello 123 world")).toBe("hello-123-world");
    });

    test("should handle numbers at start", () => {
      expect(toKebabCase("123 hello world")).toBe("123-hello-world");
    });

    test("should handle version-like patterns", () => {
      expect(toKebabCase("version 1.2.3")).toBe("version-1-2-3");
    });

    test("should handle mixed numbers and letters", () => {
      expect(toKebabCase("user123 profile456 test")).toBe("user123-profile456-test");
    });

    test("should handle camelCase with numbers", () => {
      expect(toKebabCase("version2Beta3")).toBe("version2-beta3");
    });
  });

  describe("acronyms handling", () => {
    test("should handle simple acronyms", () => {
      expect(toKebabCase("ID")).toBe("id");
    });

    test("should handle URL acronym", () => {
      expect(toKebabCase("URL")).toBe("url");
    });

    test("should handle acronym with words", () => {
      expect(toKebabCase("HTML Element")).toBe("html-element");
    });

    test("should handle multiple acronyms", () => {
      expect(toKebabCase("HTTP API")).toBe("http-api");
    });

    test("should handle acronym at end", () => {
      expect(toKebabCase("parse XML")).toBe("parse-xml");
    });

    test("should handle mixed acronyms and words", () => {
      expect(toKebabCase("XML Http Request")).toBe("xml-http-request");
    });

    test("should handle complex acronym patterns", () => {
      expect(toKebabCase("XMLParser")).toBe("xml-parser");
      expect(toKebabCase("HTTPApi")).toBe("http-api");
      expect(toKebabCase("JSONData")).toBe("json-data");
    });

    test("should handle acronym patterns correctly", () => {
      expect(toKebabCase("parseHTML5Document")).toBe("parse-html5-document");
      expect(toKebabCase("XMLHttpRequestV2")).toBe("xml-http-request-v2");
    });
  });

  describe("mixed separators", () => {
    test("should handle mixed hyphen and underscore", () => {
      expect(toKebabCase("hello-world_test")).toBe("hello-world-test");
    });

    test("should handle mixed separators with spaces", () => {
      expect(toKebabCase("hello-world test_case")).toBe("hello-world-test-case");
    });

    test("should handle all separator types", () => {
      expect(toKebabCase("hello-world_test.case api")).toBe("hello-world-test-case-api");
    });

    test("should handle multiple mixed separators", () => {
      expect(toKebabCase("hello--world__test..case")).toBe("hello-world-test-case");
    });

    test("should handle camelCase with separators", () => {
      expect(toKebabCase("helloWorld_testCase-apiKey")).toBe("hello-world-test-case-api-key");
    });
  });

  describe("special characters", () => {
    test("should ignore punctuation", () => {
      expect(toKebabCase("hello, world!")).toBe("hello-world");
    });

    test("should handle parentheses", () => {
      expect(toKebabCase("hello(world)")).toBe("hello-world");
    });

    test("should handle brackets", () => {
      expect(toKebabCase("hello[world]")).toBe("hello-world");
    });

    test("should handle braces", () => {
      expect(toKebabCase("hello{world}")).toBe("hello-world");
    });

    test("should handle quotes", () => {
      expect(toKebabCase("'hello' \"world\"")).toBe("hello-world");
    });

    test("should handle mixed special characters", () => {
      expect(toKebabCase("hello@#$%world^&*test")).toBe("hello-world-test");
    });

    test("should handle complex punctuation patterns", () => {
      expect(toKebabCase("hello... world??? test!!!")).toBe("hello-world-test");
    });
  });

  describe("unicode and international characters", () => {
    test("should handle accented characters", () => {
      expect(toKebabCase("café résumé")).toBe("café-résumé");
    });

    test("should handle cyrillic characters", () => {
      expect(toKebabCase("привет мир")).toBe("привет-мир");
    });

    test("should handle chinese characters", () => {
      expect(toKebabCase("你好 世界")).toBe("你好-世界");
    });

    test("should handle arabic characters", () => {
      expect(toKebabCase("مرحبا بالعالم")).toBe("مرحبا-بالعالم");
    });

    test("should handle mixed latin and unicode", () => {
      expect(toKebabCase("hello 世界")).toBe("hello-世界");
    });

    test("should handle emoji with text", () => {
      expect(toKebabCase("hello 😀 world")).toBe("hello-world");
    });

    test("should handle unicode camelCase", () => {
      expect(toKebabCase("caféWorld")).toBe("café-world");
    });
  });

  describe("whitespace handling", () => {
    test("should handle leading whitespace", () => {
      expect(toKebabCase("  hello world")).toBe("hello-world");
    });

    test("should handle trailing whitespace", () => {
      expect(toKebabCase("hello world  ")).toBe("hello-world");
    });

    test("should handle multiple spaces", () => {
      expect(toKebabCase("hello    world")).toBe("hello-world");
    });

    test("should handle tabs", () => {
      expect(toKebabCase("hello\tworld")).toBe("hello-world");
    });

    test("should handle newlines", () => {
      expect(toKebabCase("hello\nworld")).toBe("hello-world");
    });

    test("should handle mixed whitespace", () => {
      expect(toKebabCase("  hello \t world \n test  ")).toBe("hello-world-test");
    });

    test("should handle only whitespace", () => {
      expect(toKebabCase("   \t\n   ")).toBe("");
    });
  });

  describe("edge cases", () => {
    test("should handle single character", () => {
      expect(toKebabCase("a")).toBe("a");
    });

    test("should handle single uppercase character", () => {
      expect(toKebabCase("A")).toBe("a");
    });

    test("should handle single number", () => {
      expect(toKebabCase("1")).toBe("1");
    });

    test("should handle alternating case input", () => {
      expect(toKebabCase("aBcDeFg")).toBe("a-bc-de-fg");
    });

    test("should handle all uppercase input", () => {
      expect(toKebabCase("HELLO")).toBe("hello");
    });

    test("should handle all lowercase input", () => {
      expect(toKebabCase("hello")).toBe("hello");
    });

    test("should handle numbers only", () => {
      expect(toKebabCase("123456")).toBe("123456");
    });

    test("should handle special characters only", () => {
      expect(toKebabCase("!@#$%^&*()")).toBe("");
    });

    test("should handle very short inputs", () => {
      expect(toKebabCase("a b")).toBe("a-b");
      expect(toKebabCase("A B")).toBe("a-b");
      expect(toKebabCase("1 2")).toBe("1-2");
    });

    test("should handle hyphen only", () => {
      expect(toKebabCase("-")).toBe("");
    });

    test("should handle multiple hyphens only", () => {
      expect(toKebabCase("---")).toBe("");
    });
  });

  describe("real-world examples", () => {
    test("should convert JavaScript function names", () => {
      expect(toKebabCase("getElementById")).toBe("get-element-by-id");
      expect(toKebabCase("addEventListener")).toBe("add-event-listener");
      expect(toKebabCase("querySelector")).toBe("query-selector");
    });

    test("should convert CSS class names", () => {
      expect(toKebabCase("btnPrimary")).toBe("btn-primary");
      expect(toKebabCase("formControl")).toBe("form-control");
      expect(toKebabCase("navbarBrand")).toBe("navbar-brand");
    });

    test("should convert database column names", () => {
      expect(toKebabCase("userId")).toBe("user-id");
      expect(toKebabCase("createdAt")).toBe("created-at");
      expect(toKebabCase("firstName")).toBe("first-name");
    });

    test("should convert API endpoint names", () => {
      expect(toKebabCase("getUserById")).toBe("get-user-by-id");
      expect(toKebabCase("createUserProfile")).toBe("create-user-profile");
      expect(toKebabCase("updatePassword")).toBe("update-password");
    });

    test("should convert file names", () => {
      expect(toKebabCase("myFile.txt")).toBe("my-file-txt");
      expect(toKebabCase("userProfile.json")).toBe("user-profile-json");
      expect(toKebabCase("configDev.yaml")).toBe("config-dev-yaml");
    });

    test("should convert package names", () => {
      expect(toKebabCase("reactDom")).toBe("react-dom");
      expect(toKebabCase("lodashGet")).toBe("lodash-get");
      expect(toKebabCase("typesNode")).toBe("types-node");
    });

    test("should convert technical terms", () => {
      expect(toKebabCase("XMLHttpRequest")).toBe("xml-http-request");
      expect(toKebabCase("jsonWebToken")).toBe("json-web-token");
      expect(toKebabCase("restAPI")).toBe("rest-api");
    });

    test("should convert component names", () => {
      expect(toKebabCase("UserProfile")).toBe("user-profile");
      expect(toKebabCase("NavbarComponent")).toBe("navbar-component");
      expect(toKebabCase("ButtonGroup")).toBe("button-group");
    });
  });

  describe("parametrized tests", () => {
    test.each([
      ["hello world", "hello-world"],
      ["Hello World", "hello-world"],
      ["HELLO WORLD", "hello-world"],
      ["hello-world", "hello-world"],
      ["hello_world", "hello-world"],
      ["hello.world", "hello-world"],
      ["helloWorld", "hello-world"],
      ["HelloWorld", "hello-world"],
      ["camelCase", "camel-case"],
      ["PascalCase", "pascal-case"],
      ["hello", "hello"],
      ["Hello", "hello"],
      ["HELLO", "hello"],
      ["hello123", "hello123"],
      ["123hello", "123-hello"],
      ["XMLParser", "xml-parser"],
      ["parseXML", "parse-xml"],
      ["HTML5", "html5"],
      ["getUserById", "get-user-by-id"],
      ["user_id", "user-id"],
      ["API", "api"],
      ["", ""],
      ["   ", ""],
      ["a", "a"],
      ["A", "a"],
      ["1", "1"],
      ["hello world test", "hello-world-test"],
      ["HELLO_WORLD_TEST", "hello-world-test"],
      ["hello-world-test", "hello-world-test"],
      ["hello.world.test", "hello-world-test"],
      ["helloWorldTest", "hello-world-test"],
      ["HTTPSProxy", "https-proxy"],
      ["iPhone14Pro", "i-phone14-pro"],
    ])("toKebabCase(%s) should return %s", (input, expected) => {
      expect(toKebabCase(input)).toBe(expected);
    });
  });

  describe("complex patterns", () => {
    test("should handle complex mixed patterns", () => {
      expect(toKebabCase("parseHTML5Document")).toBe("parse-html5-document");
    });

    test("should handle version numbers", () => {
      expect(toKebabCase("v1.2.3-beta")).toBe("v1-2-3-beta");
    });

    test("should handle technical terms with versions", () => {
      expect(toKebabCase("XMLHttpRequestV2")).toBe("xml-http-request-v2");
    });

    test("should handle namespace-like patterns", () => {
      expect(toKebabCase("com.example.MyClass")).toBe("com-example-my-class");
    });

    test("should handle URL-like patterns", () => {
      expect(toKebabCase("httpAPIServer")).toBe("http-api-server");
    });

    test("should handle constant names", () => {
      expect(toKebabCase("MAX_USER_COUNT")).toBe("max-user-count");
    });

    test("should handle mixed case with numbers and separators", () => {
      expect(toKebabCase("iPhone14-Pro_Max")).toBe("i-phone14-pro-max");
    });

    test("should handle complex real-world examples", () => {
      expect(toKebabCase("XMLHttpRequest-v2.0_beta")).toBe("xml-http-request-v2-0-beta");
      expect(toKebabCase("getUserProfile_byId-V3")).toBe("get-user-profile-by-id-v3");
      expect(toKebabCase("API_KEY_VERSION_2")).toBe("api-key-version-2");
    });

    test("should handle framework component names", () => {
      expect(toKebabCase("MyAwesomeReactComponent")).toBe("my-awesome-react-component");
      expect(toKebabCase("VueJSAppRouter")).toBe("vue-js-app-router");
      expect(toKebabCase("AngularMaterialButton")).toBe("angular-material-button");
    });
  });

  describe("function behavior", () => {
    test("should return string type", () => {
      const result = toKebabCase("test");
      expect(typeof result).toBe("string");
    });

    test("should not mutate input", () => {
      const original = "helloWorld";
      const result = toKebabCase(original);
      expect(original).toBe("helloWorld");
      expect(result).toBe("hello-world");
    });

    test("should return same result for multiple calls", () => {
      const input = "helloWorld";
      const result1 = toKebabCase(input);
      const result2 = toKebabCase(input);
      expect(result1).toBe(result2);
      expect(result1).toBe("hello-world");
    });

    test("should handle very long strings", () => {
      const longString = `${"hello".repeat(1000)}World`;
      const result = toKebabCase(longString);
      expect(result).toMatch(/^hello/);
      expect(result).toMatch(/world$/);
      expect(result).toContain("-");
    });

    test("should be consistent with dependencies", () => {
      // Test consistency with splitToWords behavior
      expect(toKebabCase("XMLParser")).toBe("xml-parser");
      expect(toKebabCase("parseXML")).toBe("parse-xml");
      expect(toKebabCase("HTMLElement")).toBe("html-element");
    });

    test("should handle consecutive calls consistently", () => {
      const input = "complexTestCase123";
      const result1 = toKebabCase(input);
      const result2 = toKebabCase(input);
      const result3 = toKebabCase(input);

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
      expect(result1).toBe("complex-test-case123");
    });
  });

  describe("performance considerations", () => {
    test("should handle empty input efficiently", () => {
      expect(toKebabCase("")).toBe("");
    });

    test("should handle whitespace-only input efficiently", () => {
      expect(toKebabCase("   \n\t  ")).toBe("");
    });

    test("should handle special characters only efficiently", () => {
      expect(toKebabCase("!@#$%^&*()_+-=[]{}|;:,.<>?")).toBe("");
    });

    test("should handle single word efficiently", () => {
      expect(toKebabCase("hello")).toBe("hello");
      expect(toKebabCase("Hello")).toBe("hello");
      expect(toKebabCase("HELLO")).toBe("hello");
    });

    test("should handle already kebab-case efficiently", () => {
      expect(toKebabCase("hello-world")).toBe("hello-world");
      expect(toKebabCase("hello-world-test")).toBe("hello-world-test");
    });
  });

  describe("integration with dependencies", () => {
    test("should work correctly with splitToWords edge cases", () => {
      // Test cases that rely heavily on splitToWords behavior
      expect(toKebabCase("XMLHttpRequest")).toBe("xml-http-request");
      expect(toKebabCase("parseHTML5Document")).toBe("parse-html5-document");
      expect(toKebabCase("getUserProfile123")).toBe("get-user-profile123");
    });

    test("should handle trim behavior correctly", () => {
      expect(toKebabCase("  hello world  ")).toBe("hello-world");
      expect(toKebabCase("\t\nhelloWorld\t\n")).toBe("hello-world");
      expect(toKebabCase("   ")).toBe("");
    });

    test("should work with splitToWords acronym handling", () => {
      expect(toKebabCase("HTTPSProxy")).toBe("https-proxy");
      expect(toKebabCase("APIKeyManager")).toBe("api-key-manager");
      expect(toKebabCase("JSONWebToken")).toBe("json-web-token");
    });

    test("should handle splitToWords number patterns", () => {
      expect(toKebabCase("version2Beta3Release")).toBe("version2-beta3-release");
      expect(toKebabCase("HTML5Parser")).toBe("html5-parser");
      expect(toKebabCase("CSS3Animation")).toBe("css3-animation");
    });
  });

  describe("CSS class name scenarios", () => {
    test("should convert component class names", () => {
      expect(toKebabCase("buttonPrimary")).toBe("button-primary");
      expect(toKebabCase("cardHeader")).toBe("card-header");
      expect(toKebabCase("modalDialog")).toBe("modal-dialog");
    });

    test("should convert state class names", () => {
      expect(toKebabCase("isActive")).toBe("is-active");
      expect(toKebabCase("hasError")).toBe("has-error");
      expect(toKebabCase("isDisabled")).toBe("is-disabled");
    });

    test("should convert size and variant classes", () => {
      expect(toKebabCase("buttonLarge")).toBe("button-large");
      expect(toKebabCase("textSmall")).toBe("text-small");
      expect(toKebabCase("iconMedium")).toBe("icon-medium");
    });

    test("should convert BEM-style class names", () => {
      expect(toKebabCase("blockElementModifier")).toBe("block-element-modifier");
      expect(toKebabCase("navbarBrandLogo")).toBe("navbar-brand-logo");
      expect(toKebabCase("cardBodyContent")).toBe("card-body-content");
    });
  });

  describe("API endpoint scenarios", () => {
    test("should convert REST endpoint names", () => {
      expect(toKebabCase("getUsers")).toBe("get-users");
      expect(toKebabCase("postUser")).toBe("post-user");
      expect(toKebabCase("putUserProfile")).toBe("put-user-profile");
      expect(toKebabCase("deleteUserAccount")).toBe("delete-user-account");
    });

    test("should convert GraphQL resolver names", () => {
      expect(toKebabCase("userProfile")).toBe("user-profile");
      expect(toKebabCase("userPosts")).toBe("user-posts");
      expect(toKebabCase("createUserMutation")).toBe("create-user-mutation");
    });

    test("should convert service names", () => {
      expect(toKebabCase("userService")).toBe("user-service");
      expect(toKebabCase("authenticationService")).toBe("authentication-service");
      expect(toKebabCase("emailNotificationService")).toBe("email-notification-service");
    });
  });

  describe("file and directory scenarios", () => {
    test("should convert file names", () => {
      expect(toKebabCase("userController.js")).toBe("user-controller-js");
      expect(toKebabCase("apiRoutes.ts")).toBe("api-routes-ts");
      expect(toKebabCase("databaseConfig.json")).toBe("database-config-json");
    });

    test("should convert directory names", () => {
      expect(toKebabCase("userComponents")).toBe("user-components");
      expect(toKebabCase("sharedUtilities")).toBe("shared-utilities");
      expect(toKebabCase("testFixtures")).toBe("test-fixtures");
    });

    test("should convert package names", () => {
      expect(toKebabCase("myAwesomePackage")).toBe("my-awesome-package");
      expect(toKebabCase("reactUtilityLibrary")).toBe("react-utility-library");
      expect(toKebabCase("nodeJSHelpers")).toBe("node-js-helpers");
    });
  });
});
