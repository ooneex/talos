import { describe, expect, test } from "bun:test";
import { toPascalCase } from "@/toPascalCase";

describe("toPascalCase", () => {
  describe("basic functionality", () => {
    test("should convert simple lowercase words", () => {
      expect(toPascalCase("hello world")).toBe("HelloWorld");
    });

    test("should convert capitalized words", () => {
      expect(toPascalCase("Hello World")).toBe("HelloWorld");
    });

    test("should convert single word to capitalized", () => {
      expect(toPascalCase("hello")).toBe("Hello");
    });

    test("should convert single capitalized word to capitalized", () => {
      expect(toPascalCase("Hello")).toBe("Hello");
    });

    test("should handle empty string", () => {
      expect(toPascalCase("")).toBe("");
    });

    test("should handle whitespace only", () => {
      expect(toPascalCase("   ")).toBe("");
    });

    test("should convert multiple words", () => {
      expect(toPascalCase("hello world test")).toBe("HelloWorldTest");
    });

    test("should handle mixed case input", () => {
      expect(toPascalCase("HeLLo WoRLd")).toBe("HeLLoWoRLd");
    });
  });

  describe("camelCase conversion", () => {
    test("should convert camelCase string", () => {
      expect(toPascalCase("camelCase")).toBe("CamelCase");
    });

    test("should handle already PascalCase string", () => {
      expect(toPascalCase("PascalCase")).toBe("PascalCase");
    });

    test("should convert complex camelCase", () => {
      expect(toPascalCase("getUserProfile")).toBe("GetUserProfile");
    });

    test("should convert camelCase with numbers", () => {
      expect(toPascalCase("user123Profile")).toBe("User123Profile");
    });

    test("should handle single camelCase word", () => {
      expect(toPascalCase("hello")).toBe("Hello");
    });

    test("should handle alternating case", () => {
      expect(toPascalCase("aBcDeFg")).toBe("ABcDeFg");
    });
  });

  describe("snake_case conversion", () => {
    test("should convert simple snake_case", () => {
      expect(toPascalCase("hello_world")).toBe("HelloWorld");
    });

    test("should convert multiple snake_case words", () => {
      expect(toPascalCase("hello_world_test")).toBe("HelloWorldTest");
    });

    test("should convert uppercase snake_case", () => {
      expect(toPascalCase("HELLO_WORLD")).toBe("HelloWorld");
    });

    test("should convert mixed case snake_case", () => {
      expect(toPascalCase("Hello_World_Test")).toBe("HelloWorldTest");
    });

    test("should handle leading underscore", () => {
      expect(toPascalCase("_hello_world")).toBe("HelloWorld");
    });

    test("should handle trailing underscore", () => {
      expect(toPascalCase("hello_world_")).toBe("HelloWorld");
    });

    test("should handle multiple underscores", () => {
      expect(toPascalCase("hello__world")).toBe("HelloWorld");
    });
  });

  describe("kebab-case conversion", () => {
    test("should convert simple kebab-case", () => {
      expect(toPascalCase("hello-world")).toBe("HelloWorld");
    });

    test("should convert multiple kebab-case words", () => {
      expect(toPascalCase("hello-world-test")).toBe("HelloWorldTest");
    });

    test("should convert uppercase kebab-case", () => {
      expect(toPascalCase("HELLO-WORLD")).toBe("HelloWorld");
    });

    test("should convert mixed case kebab-case", () => {
      expect(toPascalCase("Hello-World-Test")).toBe("HelloWorldTest");
    });

    test("should handle leading hyphen", () => {
      expect(toPascalCase("-hello-world")).toBe("HelloWorld");
    });

    test("should handle trailing hyphen", () => {
      expect(toPascalCase("hello-world-")).toBe("HelloWorld");
    });

    test("should handle multiple hyphens", () => {
      expect(toPascalCase("hello--world")).toBe("HelloWorld");
    });
  });

  describe("dot.case conversion", () => {
    test("should convert dot separated words", () => {
      expect(toPascalCase("hello.world")).toBe("HelloWorld");
    });

    test("should convert multiple dot separated words", () => {
      expect(toPascalCase("hello.world.test")).toBe("HelloWorldTest");
    });

    test("should convert mixed case dot separated", () => {
      expect(toPascalCase("Hello.World.Test")).toBe("HelloWorldTest");
    });

    test("should handle leading dot", () => {
      expect(toPascalCase(".hello.world")).toBe("HelloWorld");
    });

    test("should handle trailing dot", () => {
      expect(toPascalCase("hello.world.")).toBe("HelloWorld");
    });
  });

  describe("numbers handling", () => {
    test("should handle words with numbers", () => {
      expect(toPascalCase("hello123 world456")).toBe("Hello123World456");
    });

    test("should handle standalone numbers", () => {
      expect(toPascalCase("hello 123 world")).toBe("Hello123World");
    });

    test("should handle numbers at start", () => {
      expect(toPascalCase("123 hello world")).toBe("123HelloWorld");
    });

    test("should handle version-like patterns", () => {
      expect(toPascalCase("version 1.2.3")).toBe("Version123");
    });

    test("should handle mixed numbers and letters", () => {
      expect(toPascalCase("user123 profile456 test")).toBe("User123Profile456Test");
    });

    test("should handle camelCase with numbers", () => {
      expect(toPascalCase("version2Beta3")).toBe("Version2Beta3");
    });
  });

  describe("acronyms handling", () => {
    test("should handle simple acronyms", () => {
      expect(toPascalCase("ID")).toBe("Id");
    });

    test("should handle URL acronym", () => {
      expect(toPascalCase("URL")).toBe("Url");
    });

    test("should handle acronym with words", () => {
      expect(toPascalCase("HTML Element")).toBe("HtmlElement");
    });

    test("should handle multiple acronyms", () => {
      expect(toPascalCase("HTTP API")).toBe("HttpApi");
    });

    test("should handle acronym at end", () => {
      expect(toPascalCase("parse XML")).toBe("ParseXml");
    });

    test("should handle mixed acronyms and words", () => {
      expect(toPascalCase("XML Http Request")).toBe("XmlHttpRequest");
    });

    test("should handle complex acronym patterns", () => {
      expect(toPascalCase("XMLParser")).toBe("XmlParser");
      expect(toPascalCase("HTTPApi")).toBe("HttpApi");
      expect(toPascalCase("JSONData")).toBe("JsonData");
    });

    test("should handle acronym patterns correctly", () => {
      expect(toPascalCase("parseHTML5Document")).toBe("ParseHtml5Document");
      expect(toPascalCase("XMLHttpRequestV2")).toBe("XmlHttpRequestV2");
    });
  });

  describe("mixed separators", () => {
    test("should handle mixed hyphen and underscore", () => {
      expect(toPascalCase("hello-world_test")).toBe("HelloWorldTest");
    });

    test("should handle mixed separators with spaces", () => {
      expect(toPascalCase("hello-world test_case")).toBe("HelloWorldTestCase");
    });

    test("should handle all separator types", () => {
      expect(toPascalCase("hello-world_test.case api")).toBe("HelloWorldTestCaseApi");
    });

    test("should handle multiple mixed separators", () => {
      expect(toPascalCase("hello--world__test..case")).toBe("HelloWorldTestCase");
    });

    test("should handle camelCase with separators", () => {
      expect(toPascalCase("helloWorld_testCase-apiKey")).toBe("HelloWorldTestCaseApiKey");
    });
  });

  describe("special characters", () => {
    test("should ignore punctuation", () => {
      expect(toPascalCase("hello, world!")).toBe("HelloWorld");
    });

    test("should handle parentheses", () => {
      expect(toPascalCase("hello(world)")).toBe("HelloWorld");
    });

    test("should handle brackets", () => {
      expect(toPascalCase("hello[world]")).toBe("HelloWorld");
    });

    test("should handle braces", () => {
      expect(toPascalCase("hello{world}")).toBe("HelloWorld");
    });

    test("should handle quotes", () => {
      expect(toPascalCase("'hello' \"world\"")).toBe("HelloWorld");
    });

    test("should handle mixed special characters", () => {
      expect(toPascalCase("hello@#$%world^&*test")).toBe("HelloWorldTest");
    });

    test("should handle complex punctuation patterns", () => {
      expect(toPascalCase("hello... world??? test!!!")).toBe("HelloWorldTest");
    });
  });

  describe("unicode and international characters", () => {
    test("should handle accented characters", () => {
      expect(toPascalCase("café résumé")).toBe("CaféRésumé");
    });

    test("should handle cyrillic characters", () => {
      expect(toPascalCase("привет мир")).toBe("ПриветМир");
    });

    test("should handle chinese characters", () => {
      expect(toPascalCase("你好 世界")).toBe("你好世界");
    });

    test("should handle arabic characters", () => {
      expect(toPascalCase("مرحبا بالعالم")).toBe("مرحبابالعالم");
    });

    test("should handle mixed latin and unicode", () => {
      expect(toPascalCase("hello 世界")).toBe("Hello世界");
    });

    test("should handle emoji with text", () => {
      expect(toPascalCase("hello 😀 world")).toBe("HelloWorld");
    });

    test("should handle unicode camelCase", () => {
      expect(toPascalCase("caféWorld")).toBe("CaféWorld");
    });
  });

  describe("whitespace handling", () => {
    test("should handle leading whitespace", () => {
      expect(toPascalCase("  hello world")).toBe("HelloWorld");
    });

    test("should handle trailing whitespace", () => {
      expect(toPascalCase("hello world  ")).toBe("HelloWorld");
    });

    test("should handle multiple spaces", () => {
      expect(toPascalCase("hello    world")).toBe("HelloWorld");
    });

    test("should handle tabs", () => {
      expect(toPascalCase("hello\tworld")).toBe("HelloWorld");
    });

    test("should handle newlines", () => {
      expect(toPascalCase("hello\nworld")).toBe("HelloWorld");
    });

    test("should handle mixed whitespace", () => {
      expect(toPascalCase("  hello \t world \n test  ")).toBe("HelloWorldTest");
    });

    test("should handle only whitespace", () => {
      expect(toPascalCase("   \t\n   ")).toBe("");
    });
  });

  describe("edge cases", () => {
    test("should handle single character", () => {
      expect(toPascalCase("a")).toBe("A");
    });

    test("should handle single uppercase character", () => {
      expect(toPascalCase("A")).toBe("A");
    });

    test("should handle single number", () => {
      expect(toPascalCase("1")).toBe("1");
    });

    test("should handle alternating case input", () => {
      expect(toPascalCase("aBcDeFg")).toBe("ABcDeFg");
    });

    test("should handle all uppercase input", () => {
      expect(toPascalCase("HELLO")).toBe("Hello");
    });

    test("should handle all lowercase input", () => {
      expect(toPascalCase("hello")).toBe("Hello");
    });

    test("should handle numbers only", () => {
      expect(toPascalCase("123456")).toBe("123456");
    });

    test("should handle special characters only", () => {
      expect(toPascalCase("!@#$%^&*()")).toBe("");
    });

    test("should handle very short inputs", () => {
      expect(toPascalCase("a b")).toBe("AB");
      expect(toPascalCase("A B")).toBe("AB");
      expect(toPascalCase("1 2")).toBe("12");
    });

    test("should handle separator only", () => {
      expect(toPascalCase("-")).toBe("");
      expect(toPascalCase("_")).toBe("");
      expect(toPascalCase(".")).toBe("");
    });

    test("should handle multiple separators only", () => {
      expect(toPascalCase("---")).toBe("");
      expect(toPascalCase("___")).toBe("");
      expect(toPascalCase("...")).toBe("");
    });
  });

  describe("real-world examples", () => {
    test("should convert JavaScript function names", () => {
      expect(toPascalCase("getElementById")).toBe("GetElementById");
      expect(toPascalCase("addEventListener")).toBe("AddEventListener");
      expect(toPascalCase("querySelector")).toBe("QuerySelector");
    });

    test("should convert CSS class names to component names", () => {
      expect(toPascalCase("btn-primary")).toBe("BtnPrimary");
      expect(toPascalCase("form-control")).toBe("FormControl");
      expect(toPascalCase("navbar-brand")).toBe("NavbarBrand");
    });

    test("should convert database column names", () => {
      expect(toPascalCase("user_id")).toBe("UserId");
      expect(toPascalCase("created_at")).toBe("CreatedAt");
      expect(toPascalCase("first_name")).toBe("FirstName");
    });

    test("should convert API endpoint names", () => {
      expect(toPascalCase("get user by id")).toBe("GetUserById");
      expect(toPascalCase("create user profile")).toBe("CreateUserProfile");
      expect(toPascalCase("update password")).toBe("UpdatePassword");
    });

    test("should convert file names to class names", () => {
      expect(toPascalCase("my-file.txt")).toBe("MyFileTxt");
      expect(toPascalCase("user_profile.json")).toBe("UserProfileJson");
      expect(toPascalCase("config-dev.yaml")).toBe("ConfigDevYaml");
    });

    test("should convert package names to class names", () => {
      expect(toPascalCase("react-dom")).toBe("ReactDom");
      expect(toPascalCase("lodash.get")).toBe("LodashGet");
      expect(toPascalCase("types/node")).toBe("TypesNode");
    });

    test("should convert technical terms", () => {
      expect(toPascalCase("xml http request")).toBe("XmlHttpRequest");
      expect(toPascalCase("json web token")).toBe("JsonWebToken");
      expect(toPascalCase("rest api")).toBe("RestApi");
    });

    test("should convert component names", () => {
      expect(toPascalCase("user-profile")).toBe("UserProfile");
      expect(toPascalCase("navbar_component")).toBe("NavbarComponent");
      expect(toPascalCase("button.group")).toBe("ButtonGroup");
    });
  });

  describe("parametrized tests", () => {
    test.each([
      ["hello world", "HelloWorld"],
      ["Hello World", "HelloWorld"],
      ["HELLO WORLD", "HelloWorld"],
      ["hello-world", "HelloWorld"],
      ["hello_world", "HelloWorld"],
      ["hello.world", "HelloWorld"],
      ["helloWorld", "HelloWorld"],
      ["HelloWorld", "HelloWorld"],
      ["camelCase", "CamelCase"],
      ["PascalCase", "PascalCase"],
      ["hello", "Hello"],
      ["Hello", "Hello"],
      ["HELLO", "Hello"],
      ["hello123", "Hello123"],
      ["123hello", "123Hello"],
      ["XMLParser", "XmlParser"],
      ["parseXML", "ParseXml"],
      ["HTML5", "Html5"],
      ["getUserById", "GetUserById"],
      ["user_id", "UserId"],
      ["API", "Api"],
      ["", ""],
      ["   ", ""],
      ["a", "A"],
      ["A", "A"],
      ["1", "1"],
      ["hello world test", "HelloWorldTest"],
      ["HELLO_WORLD_TEST", "HelloWorldTest"],
      ["hello-world-test", "HelloWorldTest"],
      ["hello.world.test", "HelloWorldTest"],
      ["helloWorldTest", "HelloWorldTest"],
      ["HTTPSProxy", "HttpsProxy"],
      ["iPhone14Pro", "IPhone14Pro"],
      ["myReactComponent", "MyReactComponent"],
      ["VUE_JS_APP", "VueJsApp"],
      ["angular.material.button", "AngularMaterialButton"],
    ])("toPascalCase(%s) should return %s", (input, expected) => {
      expect(toPascalCase(input)).toBe(expected);
    });
  });

  describe("complex patterns", () => {
    test("should handle complex mixed patterns", () => {
      expect(toPascalCase("parseHTML5Document")).toBe("ParseHtml5Document");
    });

    test("should handle version numbers", () => {
      expect(toPascalCase("v1.2.3-beta")).toBe("V123Beta");
    });

    test("should handle technical terms with versions", () => {
      expect(toPascalCase("XMLHttpRequestV2")).toBe("XmlHttpRequestV2");
    });

    test("should handle namespace-like patterns", () => {
      expect(toPascalCase("com.example.MyClass")).toBe("ComExampleMyClass");
    });

    test("should handle URL-like patterns", () => {
      expect(toPascalCase("http API Server")).toBe("HttpApiServer");
    });

    test("should handle constant names", () => {
      expect(toPascalCase("MAX_USER_COUNT")).toBe("MaxUserCount");
    });

    test("should handle mixed case with numbers and separators", () => {
      expect(toPascalCase("iPhone14-Pro_Max")).toBe("IPhone14ProMax");
    });

    test("should handle complex real-world examples", () => {
      expect(toPascalCase("XMLHttpRequest-v2.0_beta")).toBe("XmlHttpRequestV20Beta");
      expect(toPascalCase("getUserProfile_byId-V3")).toBe("GetUserProfileByIdV3");
      expect(toPascalCase("API_KEY_VERSION_2")).toBe("ApiKeyVersion2");
    });

    test("should handle framework component names", () => {
      expect(toPascalCase("MyAwesomeReactComponent")).toBe("MyAwesomeReactComponent");
      expect(toPascalCase("VueJSAppRouter")).toBe("VueJsAppRouter");
      expect(toPascalCase("AngularMaterialButton")).toBe("AngularMaterialButton");
    });
  });

  describe("function behavior", () => {
    test("should return string type", () => {
      const result = toPascalCase("test");
      expect(typeof result).toBe("string");
    });

    test("should not mutate input", () => {
      const original = "helloWorld";
      const result = toPascalCase(original);
      expect(original).toBe("helloWorld");
      expect(result).toBe("HelloWorld");
    });

    test("should return same result for multiple calls", () => {
      const input = "helloWorld";
      const result1 = toPascalCase(input);
      const result2 = toPascalCase(input);
      expect(result1).toBe(result2);
      expect(result1).toBe("HelloWorld");
    });

    test("should handle very long strings", () => {
      const longString = `${"hello".repeat(1000)}World`;
      const result = toPascalCase(longString);
      expect(result).toMatch(/^Hello/);
      expect(result).toMatch(/World$/);
      expect(result).not.toContain("-");
      expect(result).not.toContain("_");
      expect(result).not.toContain(" ");
    });

    test("should be consistent with dependencies", () => {
      // Test consistency with splitToWords and capitalizeWord behavior
      expect(toPascalCase("XMLParser")).toBe("XmlParser");
      expect(toPascalCase("parseXML")).toBe("ParseXml");
      expect(toPascalCase("HTMLElement")).toBe("HtmlElement");
    });

    test("should handle consecutive calls consistently", () => {
      const input = "complexTestCase123";
      const result1 = toPascalCase(input);
      const result2 = toPascalCase(input);
      const result3 = toPascalCase(input);

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
      expect(result1).toBe("ComplexTestCase123");
    });
  });

  describe("performance considerations", () => {
    test("should handle empty input efficiently", () => {
      expect(toPascalCase("")).toBe("");
    });

    test("should handle whitespace-only input efficiently", () => {
      expect(toPascalCase("   \n\t  ")).toBe("");
    });

    test("should handle special characters only efficiently", () => {
      expect(toPascalCase("!@#$%^&*()_+-=[]{}|;:,.<>?")).toBe("");
    });

    test("should handle single word efficiently", () => {
      expect(toPascalCase("hello")).toBe("Hello");
      expect(toPascalCase("Hello")).toBe("Hello");
      expect(toPascalCase("HELLO")).toBe("Hello");
    });

    test("should handle already PascalCase efficiently", () => {
      expect(toPascalCase("HelloWorld")).toBe("HelloWorld");
      expect(toPascalCase("HelloWorldTest")).toBe("HelloWorldTest");
    });
  });

  describe("integration with dependencies", () => {
    test("should work correctly with splitToWords edge cases", () => {
      // Test cases that rely heavily on splitToWords behavior
      expect(toPascalCase("XMLHttpRequest")).toBe("XmlHttpRequest");
      expect(toPascalCase("parseHTML5Document")).toBe("ParseHtml5Document");
      expect(toPascalCase("getUserProfile123")).toBe("GetUserProfile123");
    });

    test("should work correctly with capitalizeWord edge cases", () => {
      // Test cases that rely heavily on capitalizeWord behavior
      expect(toPascalCase("hello world")).toBe("HelloWorld");
      expect(toPascalCase("HELLO WORLD")).toBe("HelloWorld");
      expect(toPascalCase("café résumé")).toBe("CaféRésumé");
    });

    test("should handle trim behavior correctly", () => {
      expect(toPascalCase("  hello world  ")).toBe("HelloWorld");
      expect(toPascalCase("\t\nhelloWorld\t\n")).toBe("HelloWorld");
      expect(toPascalCase("   ")).toBe("");
    });

    test("should work with splitToWords acronym handling", () => {
      expect(toPascalCase("HTTPSProxy")).toBe("HttpsProxy");
      expect(toPascalCase("APIKeyManager")).toBe("ApiKeyManager");
      expect(toPascalCase("JSONWebToken")).toBe("JsonWebToken");
    });

    test("should handle splitToWords number patterns", () => {
      expect(toPascalCase("version2Beta3Release")).toBe("Version2Beta3Release");
      expect(toPascalCase("HTML5Parser")).toBe("Html5Parser");
      expect(toPascalCase("CSS3Animation")).toBe("Css3Animation");
    });
  });

  describe("React component naming scenarios", () => {
    test("should convert component prop names", () => {
      expect(toPascalCase("isLoading")).toBe("IsLoading");
      expect(toPascalCase("hasError")).toBe("HasError");
      expect(toPascalCase("showModal")).toBe("ShowModal");
    });

    test("should convert component state names", () => {
      expect(toPascalCase("userProfile")).toBe("UserProfile");
      expect(toPascalCase("authToken")).toBe("AuthToken");
      expect(toPascalCase("apiResponse")).toBe("ApiResponse");
    });

    test("should convert hook names", () => {
      expect(toPascalCase("useEffect")).toBe("UseEffect");
      expect(toPascalCase("useState")).toBe("UseState");
      expect(toPascalCase("useCustomHook")).toBe("UseCustomHook");
    });

    test("should convert context names", () => {
      expect(toPascalCase("authContext")).toBe("AuthContext");
      expect(toPascalCase("themeProvider")).toBe("ThemeProvider");
      expect(toPascalCase("userDataContext")).toBe("UserDataContext");
    });
  });

  describe("class and interface naming scenarios", () => {
    test("should convert class names", () => {
      expect(toPascalCase("userService")).toBe("UserService");
      expect(toPascalCase("authenticationManager")).toBe("AuthenticationManager");
      expect(toPascalCase("databaseConnection")).toBe("DatabaseConnection");
    });

    test("should convert interface names", () => {
      expect(toPascalCase("userInterface")).toBe("UserInterface");
      expect(toPascalCase("apiResponse")).toBe("ApiResponse");
      expect(toPascalCase("configOptions")).toBe("ConfigOptions");
    });

    test("should convert type names", () => {
      expect(toPascalCase("userType")).toBe("UserType");
      expect(toPascalCase("apiEndpoint")).toBe("ApiEndpoint");
      expect(toPascalCase("httpMethod")).toBe("HttpMethod");
    });

    test("should convert enum names", () => {
      expect(toPascalCase("userStatus")).toBe("UserStatus");
      expect(toPascalCase("orderState")).toBe("OrderState");
      expect(toPascalCase("paymentMethod")).toBe("PaymentMethod");
    });
  });

  describe("framework-specific scenarios", () => {
    test("should convert Vue component names", () => {
      expect(toPascalCase("my-component")).toBe("MyComponent");
      expect(toPascalCase("user-profile-card")).toBe("UserProfileCard");
      expect(toPascalCase("navigation-bar")).toBe("NavigationBar");
    });

    test("should convert Angular component names", () => {
      expect(toPascalCase("app-header")).toBe("AppHeader");
      expect(toPascalCase("user-list-item")).toBe("UserListItem");
      expect(toPascalCase("form-input-field")).toBe("FormInputField");
    });

    test("should convert service names", () => {
      expect(toPascalCase("data-service")).toBe("DataService");
      expect(toPascalCase("auth-guard")).toBe("AuthGuard");
      expect(toPascalCase("http-interceptor")).toBe("HttpInterceptor");
    });

    test("should convert module names", () => {
      expect(toPascalCase("user-module")).toBe("UserModule");
      expect(toPascalCase("shared-module")).toBe("SharedModule");
      expect(toPascalCase("core-module")).toBe("CoreModule");
    });
  });

  describe("API and backend scenarios", () => {
    test("should convert model names", () => {
      expect(toPascalCase("user-model")).toBe("UserModel");
      expect(toPascalCase("order_item")).toBe("OrderItem");
      expect(toPascalCase("product.category")).toBe("ProductCategory");
    });

    test("should convert controller names", () => {
      expect(toPascalCase("user_controller")).toBe("UserController");
      expect(toPascalCase("auth-controller")).toBe("AuthController");
      expect(toPascalCase("api.controller")).toBe("ApiController");
    });

    test("should convert middleware names", () => {
      expect(toPascalCase("auth_middleware")).toBe("AuthMiddleware");
      expect(toPascalCase("cors-middleware")).toBe("CorsMiddleware");
      expect(toPascalCase("logging.middleware")).toBe("LoggingMiddleware");
    });

    test("should convert repository names", () => {
      expect(toPascalCase("user_repository")).toBe("UserRepository");
      expect(toPascalCase("order-repository")).toBe("OrderRepository");
      expect(toPascalCase("product.repository")).toBe("ProductRepository");
    });
  });
});
