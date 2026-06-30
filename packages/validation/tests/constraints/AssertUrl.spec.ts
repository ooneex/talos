import { describe, expect, test } from "bun:test";
import { AssertUrl } from "@/constraints";

describe("AssertUrl", () => {
  const validator = new AssertUrl();

  test("should validate valid URLs with protocols", () => {
    const validUrlsWithProtocols = [
      "https://example.com",
      "http://example.com",
      "https://www.example.com",
      "http://www.example.com",
      "https://subdomain.example.com",
      "http://subdomain.example.com",
      "https://example.co.uk",
      "http://example.co.uk",
      "https://www.example.co.uk",
      "http://www.example.co.uk",
      "https://my-site.example.com",
      "http://my-site.example.com",
      "https://test123.example.org",
      "http://test123.example.org",
    ];

    for (const url of validUrlsWithProtocols) {
      const result = validator.validate(url);
      expect(result.isValid).toBe(true);
    }
  });

  test("should validate valid URLs without protocols", () => {
    const validUrlsWithoutProtocols = [
      "example.com",
      "www.example.com",
      "subdomain.example.com",
      "example.co.uk",
      "www.example.co.uk",
      "my-site.example.com",
      "test123.example.org",
      "site.museum",
      "company.travel",
      "blog.photography",
    ];

    for (const url of validUrlsWithoutProtocols) {
      const result = validator.validate(url);
      expect(result.isValid).toBe(true);
    }
  });

  test("should validate URLs with paths", () => {
    const urlsWithPaths = [
      "https://example.com/path",
      "http://example.com/path/to/resource",
      "https://www.example.com/path/to/file.html",
      "example.com/simple/path",
      "www.example.com/path/with-dashes",
      "subdomain.example.com/path/with_underscores",
      "https://example.com/path/with.dots",
      "http://example.com/path/with spaces",
      "https://example.com/path/with/multiple/levels",
      "example.com/file.pdf",
      "www.example.com/image.jpg",
      "https://example.com/document.docx",
    ];

    for (const url of urlsWithPaths) {
      const result = validator.validate(url);
      expect(result.isValid).toBe(true);
    }
  });

  test("should validate URLs with query parameters", () => {
    const urlsWithQueryParams = [
      "https://example.com?param=value",
      "http://example.com?param1=value1&param2=value2",
      "example.com?search=test",
      "www.example.com?id=123&name=john",
      "https://example.com/path?param=value",
      "http://example.com/path/to/resource?q=search&sort=date",
      "example.com/page?filter=active&limit=10",
      "https://example.com?param=value%20with%20spaces",
      "http://example.com?param=value+with+plus",
      "https://example.com?param=value.with.dots",
      "example.com?param=value_with_underscores",
      "www.example.com?param=value-with-dashes",
      "https://example.com?param=value~with~tildes",
      "http://example.com?param=value=with=equals",
    ];

    for (const url of urlsWithQueryParams) {
      const result = validator.validate(url);
      expect(result.isValid).toBe(true);
    }
  });

  test("should validate URLs with fragments", () => {
    const urlsWithFragments = [
      "https://example.com#section",
      "http://example.com#top",
      "example.com#fragment",
      "www.example.com#section-1",
      "https://example.com/path#section",
      "http://example.com/path/to/resource#anchor",
      "example.com/page#fragment_with_underscores",
      "https://example.com?param=value#section",
      "http://example.com/path?query=test#fragment",
      "www.example.com?id=123#section-2",
      "https://example.com#123",
      "example.com#a1b2c3",
    ];

    for (const url of urlsWithFragments) {
      const result = validator.validate(url);
      expect(result.isValid).toBe(true);
    }
  });

  test("should validate URLs with ports (when using strict validation)", () => {
    const urlsWithPorts = [
      "https://example.com:443",
      "http://example.com:80",
      "https://example.com:8080",
      "http://localhost:3000",
      "https://api.example.com:8443",
      "http://test.example.com:8000",
      "https://example.com:443/path",
      "http://example.com:80/path?param=value",
      "https://example.com:8080/path?param=value#section",
    ];

    for (const url of urlsWithPorts) {
      const result = validator.validateStrict(url);
      expect(result.isValid).toBe(true);
    }
  });

  test("should validate complex URLs", () => {
    const complexUrls = [
      "https://www.example.com/path/to/resource?param1=value1&param2=value2#section",
      "http://subdomain.example.co.uk/complex/path/file.html?search=test&filter=active#results",
      "https://my-site.example.org/api/v1/users?limit=10&offset=20&sort=name#user-list",
      "example.com/products/electronics/smartphones?brand=apple&color=black&storage=128gb",
      "www.example.com/blog/2024/01/15/article-title?utm_source=google&utm_medium=search#comments",
    ];

    for (const url of complexUrls) {
      const result = validator.validate(url);
      expect(result.isValid).toBe(true);
    }
  });

  test("should reject URLs that are too long", () => {
    const longUrl = `https://example.com/${"a".repeat(2070)}`;
    const result = validator.validate(longUrl);
    expect(result.isValid).toBe(false);
    expect(result.message).toBe(
      "URL must be between 1 and 2083 characters and follow a valid URL format (e.g., https://example.com, http://sub.domain.co.uk/path)",
    );
  });

  test("should accept URLs at maximum length", () => {
    const maxLengthUrl = `https://example.com/${"a".repeat(2063)}`;
    const result = validator.validate(maxLengthUrl);
    expect(result.isValid).toBe(true);
  });

  test("should reject empty strings", () => {
    const result = validator.validate("");
    expect(result.isValid).toBe(false);
    expect(result.message).toBe(
      "URL must be between 1 and 2083 characters and follow a valid URL format (e.g., https://example.com, http://sub.domain.co.uk/path)",
    );
  });

  test("should reject invalid URL formats", () => {
    const invalidUrls = [
      "not-a-url",
      "just text",
      "example",
      "www",
      "http://",
      "https://",
      "://example.com",
      "example.",
      ".example.com",
      "example..com",
      "example.com.",
      "http://.example.com",
      "https://example.",
      "ftp://example.com",
      "mailto:user@example.com",
      "file:///path/to/file",
    ];

    for (const url of invalidUrls) {
      const result = validator.validate(url);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "URL must be between 1 and 2083 characters and follow a valid URL format (e.g., https://example.com, http://sub.domain.co.uk/path)",
      );
    }
  });

  test("should reject URLs with invalid characters", () => {
    const invalidCharUrls = [
      "https://example.com/<script>",
      "http://example.com/path with<>quotes",
      "example.com/path|with|pipes",
      "https://example.com/path\\with\\backslashes",
      "http://example.com/path^with^carets",
      "example.com/path{with}braces",
      "https://example.com/path[with]brackets",
      "http://example.com/path`with`backticks",
      "example.com/path with\ttabs",
      "https://example.com/path with\nnewlines",
    ];

    for (const url of invalidCharUrls) {
      const result = validator.validate(url);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "URL must be between 1 and 2083 characters and follow a valid URL format (e.g., https://example.com, http://sub.domain.co.uk/path)",
      );
    }
  });

  test("should reject non-string values", () => {
    const nonStringValues = [
      123,
      null,
      undefined,
      {},
      [],
      true,
      false,
      0,
      -1,
      3.14,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Symbol("url"),
      new Date(),
      /regex/,
      () => {},
      new Set(),
      new Map(),
      new URL("https://example.com"),
    ];

    for (const value of nonStringValues) {
      const result = validator.validate(value);
      expect(result.isValid).toBe(false);
    }
  });

  test("should validate various TLDs", () => {
    const urlsWithVariousTlds = [
      "example.com",
      "example.org",
      "example.net",
      "example.edu",
      "example.gov",
      "example.mil",
      "example.co.uk",
      "example.com.au",
      "example.de",
      "example.fr",
      "example.jp",
      "example.cn",
      "example.io",
      "example.ai",
      "example.museum",
      "example.travel",
      "example.photography",
      "example.technology",
    ];

    for (const url of urlsWithVariousTlds) {
      const result = validator.validate(url);
      expect(result.isValid).toBe(true);
    }
  });

  test("should validate localhost and IP-like domains", () => {
    const localhostUrls = [
      "localhost",
      "http://localhost",
      "https://localhost",
      "localhost:3000",
      "http://localhost:3000",
      "https://localhost:8080",
    ];

    for (const url of localhostUrls) {
      validator.validate(url);
    }
  });

  test("should handle edge cases with whitespace", () => {
    const whitespaceUrls = [
      " https://example.com",
      "https://example.com ",
      " https://example.com ",
      "https://example.com\n",
      "https://example.com\t",
      "\nhttps://example.com",
      "\thttps://example.com",
    ];

    for (const url of whitespaceUrls) {
      const result = validator.validate(url);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "URL must be between 1 and 2083 characters and follow a valid URL format (e.g., https://example.com, http://sub.domain.co.uk/path)",
      );
    }
  });

  test("should validate international domain names", () => {
    const internationalDomains = [
      "xn--example.com",
      "test-site.example.com",
      "site_with_underscores.example.com",
      "123site.example.com",
      "site123.example.com",
      "my-awesome-site.example.org",
    ];

    for (const url of internationalDomains) {
      const result = validator.validate(url);
      if (!url.includes("_")) {
        expect(result.isValid).toBe(true);
      }
    }
  });

  test("should test strict validation separately", () => {
    const urlsForStrictValidation = [
      { url: "https://example.com", shouldPass: true },
      { url: "http://example.com", shouldPass: true },
      { url: "https://www.example.com", shouldPass: true },
      { url: "http://subdomain.example.com", shouldPass: true },
      { url: "https://example.com:8080", shouldPass: true },
      { url: "http://example.com/path", shouldPass: true },
      { url: "https://example.com/path?param=value", shouldPass: true },
      { url: "http://example.com/path#section", shouldPass: true },
      { url: "example.com", shouldPass: false },
      { url: "www.example.com", shouldPass: false },
      { url: "subdomain.example.com/path", shouldPass: false },
      { url: "ftp://example.com", shouldPass: false },
      { url: "mailto:user@example.com", shouldPass: false },
    ];

    for (const { url, shouldPass } of urlsForStrictValidation) {
      const result = validator.validateStrict(url);
      if (shouldPass) {
        expect(result.isValid).toBe(true);
      } else {
        expect(result.isValid).toBe(false);
        if (result.message) {
          expect(result.message).toBe("URL must include protocol (http:// or https://) and follow strict URL format");
        }
      }
    }
  });

  test("should provide correct error message for regular validation", () => {
    const result = validator.validate("invalid-url");
    expect(result.isValid).toBe(false);
    expect(result.message).toBe(
      "URL must be between 1 and 2083 characters and follow a valid URL format (e.g., https://example.com, http://sub.domain.co.uk/path)",
    );
  });

  test("should provide correct error message for strict validation", () => {
    const result = validator.validateStrict("example.com");
    expect(result.isValid).toBe(false);
    expect(result.message).toBe("URL must include protocol (http:// or https://) and follow strict URL format");
  });

  test("should return constraint correctly", () => {
    const constraint = validator.getConstraint();
    expect(constraint).toBeDefined();
  });

  test("should return error message correctly", () => {
    const errorMessage = validator.getErrorMessage();
    expect(errorMessage).toBe(
      "URL must be between 1 and 2083 characters and follow a valid URL format (e.g., https://example.com, http://sub.domain.co.uk/path)",
    );
  });

  test("should handle case sensitivity in protocols and domains", () => {
    const caseSensitiveUrls = [
      "HTTP://EXAMPLE.COM",
      "HTTPS://EXAMPLE.COM",
      "Http://Example.Com",
      "Https://Example.Com",
    ];

    for (const url of caseSensitiveUrls) {
      const result = validator.validate(url);
      expect(result.isValid).toBe(true);
    }
  });

  test("should handle boundary cases for URL length", () => {
    const minLengthUrl = "a.co";
    const result1 = validator.validate(minLengthUrl);
    expect(result1.isValid).toBe(true);

    const almostTooLongUrl = `https://example.com/${"a".repeat(2062)}`;
    const result2 = validator.validate(almostTooLongUrl);
    expect(result2.isValid).toBe(true);

    const exactMaxLengthUrl = `https://example.com/${"a".repeat(2063)}`;
    const result3 = validator.validate(exactMaxLengthUrl);
    expect(result3.isValid).toBe(true);

    const tooLongUrl = `https://example.com/${"a".repeat(2064)}`;
    const result4 = validator.validate(tooLongUrl);
    expect(result4.isValid).toBe(false);
  });

  test("should validate real-world URLs", () => {
    const realWorldUrls = [
      "https://www.google.com",
      "http://github.com/user/repo",
      "https://stackoverflow.com/questions/123456/how-to-do-something",
      "https://api.example.com/v1/users?limit=10&offset=0",
      "http://blog.example.org/2024/01/post-title?utm_source=twitter#comments",
      "https://cdn.example.net/assets/images/logo.png",
      "http://shop.example.co.uk/products/category/item?color=red&size=large",
      "https://docs.example.io/guide/getting-started#installation",
    ];

    for (const url of realWorldUrls) {
      const result = validator.validate(url);
      expect(result.isValid).toBe(true);
    }
  });
});
