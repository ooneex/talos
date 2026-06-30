import { describe, expect, test } from "bun:test";
import { ReadonlyUrl } from "@/index";

describe("ReadonlyUrl", () => {
  describe("Constructor", () => {
    test("should accept string URL", () => {
      const url = new ReadonlyUrl("https://example.com");
      expect(url.getHostname()).toBe("example.com");
    });

    test("should accept URL object", () => {
      const nativeUrl = new URL("https://example.com/test");
      const url = new ReadonlyUrl(nativeUrl);
      expect(url.getHostname()).toBe("example.com");
      expect(url.getPath()).toBe("/test");
    });

    test("should throw error for invalid URL string", () => {
      expect(() => new ReadonlyUrl("invalid-url")).toThrow();
    });
  });

  describe("Protocol parsing", () => {
    test("should parse HTTP protocol correctly", () => {
      const url = new ReadonlyUrl("http://example.com");
      expect(url.getProtocol()).toBe("http");
    });

    test("should parse HTTPS protocol correctly", () => {
      const url = new ReadonlyUrl("https://example.com");
      expect(url.getProtocol()).toBe("https");
    });

    test("should parse FTP protocol correctly", () => {
      const url = new ReadonlyUrl("ftp://files.example.com");
      expect(url.getProtocol()).toBe("ftp");
    });

    test("should parse custom protocol correctly", () => {
      const url = new ReadonlyUrl("custom://example.com");
      expect(url.getProtocol()).toBe("custom");
    });
  });

  describe("Hostname and Domain parsing", () => {
    test("should parse simple domain correctly", () => {
      const url = new ReadonlyUrl("https://example.com");
      expect(url.getHostname()).toBe("example.com");
      expect(url.getDomain()).toBe("example.com");
      expect(url.getSubdomain()).toBe(null);
    });

    test("should parse single subdomain correctly", () => {
      const url = new ReadonlyUrl("https://www.example.com");
      expect(url.getHostname()).toBe("www.example.com");
      expect(url.getDomain()).toBe("example.com");
      expect(url.getSubdomain()).toBe("www");
    });

    test("should parse multiple subdomains correctly", () => {
      const url = new ReadonlyUrl("https://api.v1.example.com");
      expect(url.getHostname()).toBe("api.v1.example.com");
      expect(url.getDomain()).toBe("example.com");
      expect(url.getSubdomain()).toBe("api.v1");
    });

    test("should parse complex subdomains correctly", () => {
      const url = new ReadonlyUrl("https://dev.blog.staging.example.com");
      expect(url.getHostname()).toBe("dev.blog.staging.example.com");
      expect(url.getDomain()).toBe("example.com");
      expect(url.getSubdomain()).toBe("dev.blog.staging");
    });

    test("should handle localhost correctly", () => {
      const url = new ReadonlyUrl("http://localhost");
      expect(url.getHostname()).toBe("localhost");
      expect(url.getDomain()).toBe("localhost");
      expect(url.getSubdomain()).toBe(null);
    });

    test("should handle IP addresses correctly", () => {
      const url = new ReadonlyUrl("http://192.168.1.1");
      expect(url.getHostname()).toBe("192.168.1.1");
      expect(url.getDomain()).toBe("192.168.1.1");
      expect(url.getSubdomain()).toBe(null);
    });

    test("should handle domains with hyphens and underscores", () => {
      const url = new ReadonlyUrl("https://my-api.test_domain.example-site.com");
      expect(url.getHostname()).toBe("my-api.test_domain.example-site.com");
      expect(url.getDomain()).toBe("example-site.com");
      expect(url.getSubdomain()).toBe("my-api.test_domain");
    });

    test("should handle domains with numbers", () => {
      const url = new ReadonlyUrl("https://api2.v1.example2.com");
      expect(url.getHostname()).toBe("api2.v1.example2.com");
      expect(url.getDomain()).toBe("example2.com");
      expect(url.getSubdomain()).toBe("api2.v1");
    });
  });

  describe("Port parsing", () => {
    test("should default to port 80 when no port specified", () => {
      const url = new ReadonlyUrl("https://example.com");
      expect(url.getPort()).toBe(80);
    });

    test("should parse custom port correctly", () => {
      const url = new ReadonlyUrl("https://example.com:8080");
      expect(url.getPort()).toBe(8080);
    });

    test("should parse standard HTTP port", () => {
      const url = new ReadonlyUrl("http://example.com:80");
      expect(url.getPort()).toBe(80);
    });

    test("should parse standard HTTPS port", () => {
      const url = new ReadonlyUrl("https://example.com:443");
      expect(url.getPort()).toBe(443);
    });

    test("should parse high port numbers", () => {
      const url = new ReadonlyUrl("http://example.com:65535");
      expect(url.getPort()).toBe(65_535);
    });

    test("should parse port 0", () => {
      const url = new ReadonlyUrl("http://example.com:0");
      expect(url.getPort()).toBe(0);
    });
  });

  describe("Path parsing", () => {
    test("should default to root path when no path specified", () => {
      const url = new ReadonlyUrl("https://example.com");
      expect(url.getPath()).toBe("/");
    });

    test("should parse simple path correctly", () => {
      const url = new ReadonlyUrl("https://example.com/api");
      expect(url.getPath()).toBe("/api");
    });

    test("should parse nested path correctly", () => {
      const url = new ReadonlyUrl("https://example.com/api/v1/users");
      expect(url.getPath()).toBe("/api/v1/users");
    });

    test("should handle trailing slash correctly", () => {
      const url = new ReadonlyUrl("https://example.com/api/");
      expect(url.getPath()).toBe("/api");
    });

    test("should handle path with encoded characters", () => {
      const url = new ReadonlyUrl("https://example.com/api/user%20name");
      expect(url.getPath()).toBe("/api/user%20name");
    });

    test("should handle path with special characters", () => {
      const url = new ReadonlyUrl("https://example.com/api/users-and_teams");
      expect(url.getPath()).toBe("/api/users-and_teams");
    });

    test("should handle empty path segments", () => {
      const url = new ReadonlyUrl("https://example.com//api//users//");
      expect(url.getPath()).toBe("//api//users");
    });
  });

  describe("Query parameters parsing", () => {
    test("should parse no query parameters", () => {
      const url = new ReadonlyUrl("https://example.com");
      expect(url.getQueries()).toEqual({});
    });

    test("should parse single query parameter", () => {
      const url = new ReadonlyUrl("https://example.com?name=john");
      expect(url.getQueries()).toEqual({ name: "john" });
    });

    test("should parse multiple query parameters", () => {
      const url = new ReadonlyUrl("https://example.com?name=john&age=25&active=true");
      const queries = url.getQueries();
      expect(queries.name).toBe("john");
      expect(queries.age).toBe(25);
      expect(queries.active).toBe(true);
    });

    test("should parse numeric query parameters", () => {
      const url = new ReadonlyUrl("https://example.com?count=10&price=19.99&negative=-5");
      const queries = url.getQueries();
      expect(queries.count).toBe(10);
      expect(queries.price).toBe(19.99);
      expect(queries.negative).toBe(-5);
    });

    test("should parse boolean query parameters", () => {
      const url = new ReadonlyUrl("https://example.com?active=true&disabled=false");
      const queries = url.getQueries();
      expect(queries.active).toBe(true);
      expect(queries.disabled).toBe(false);
    });

    test("should parse string query parameters that look like numbers", () => {
      const url = new ReadonlyUrl("https://example.com?id=001&code=123abc");
      const queries = url.getQueries();
      expect(queries.id).toBe("001");
      expect(queries.code).toBe("123abc");
    });

    test("should parse empty query parameters", () => {
      const url = new ReadonlyUrl("https://example.com?empty=&blank");
      const queries = url.getQueries();
      expect(queries.empty).toBe("");
      expect(queries.blank).toBe("");
    });

    test("should parse encoded query parameters", () => {
      const url = new ReadonlyUrl("https://example.com?message=hello%20world&special=%3D%26");
      const queries = url.getQueries();
      expect(queries.message).toBe("hello world");
      expect(queries.special).toBe("=&");
    });

    test("should handle duplicate query parameter keys", () => {
      const url = new ReadonlyUrl("https://example.com?tag=red&tag=blue");
      const queries = url.getQueries();
      // Last value should win
      expect(queries.tag).toBe("blue");
    });
  });

  describe("Fragment parsing", () => {
    test("should parse no fragment", () => {
      const url = new ReadonlyUrl("https://example.com");
      expect(url.getFragment()).toBe("");
    });

    test("should parse simple fragment", () => {
      const url = new ReadonlyUrl("https://example.com#section1");
      expect(url.getFragment()).toBe("section1");
    });

    test("should parse complex fragment", () => {
      const url = new ReadonlyUrl("https://example.com#section-1_part-a");
      expect(url.getFragment()).toBe("section-1_part-a");
    });

    test("should parse fragment with encoded characters", () => {
      const url = new ReadonlyUrl("https://example.com#section%201");
      expect(url.getFragment()).toBe("section%201");
    });

    test("should parse empty fragment", () => {
      const url = new ReadonlyUrl("https://example.com#");
      expect(url.getFragment()).toBe("");
    });
  });

  describe("Base and Origin", () => {
    test("should generate base correctly for simple URL", () => {
      const url = new ReadonlyUrl("https://example.com");
      expect(url.getBase()).toBe("https://example.com");
    });

    test("should generate base correctly with port", () => {
      const url = new ReadonlyUrl("https://example.com:8080");
      expect(url.getBase()).toBe("https://example.com:8080");
    });

    test("should generate base correctly with subdomain", () => {
      const url = new ReadonlyUrl("https://api.example.com");
      expect(url.getBase()).toBe("https://api.example.com");
    });

    test("should generate origin correctly", () => {
      const url = new ReadonlyUrl("https://example.com/path?query=value#fragment");
      expect(url.getOrigin()).toBe("https://example.com");
    });

    test("should generate origin correctly with port", () => {
      const url = new ReadonlyUrl("https://example.com:8080/path");
      expect(url.getOrigin()).toBe("https://example.com:8080");
    });
  });

  describe("Native URL object", () => {
    test("should return native URL object", () => {
      const url = new ReadonlyUrl("https://example.com/test");
      const native = url.getNative();
      expect(native).toBeInstanceOf(URL);
      expect(native.hostname).toBe("example.com");
      expect(native.pathname).toBe("/test");
    });

    test("should maintain reference to same native URL", () => {
      const url = new ReadonlyUrl("https://example.com");
      const native1 = url.getNative();
      const native2 = url.getNative();
      expect(native1).toBe(native2);
    });
  });

  describe("toString method", () => {
    test("should convert simple URL to string", () => {
      const urlString = "https://example.com/";
      const url = new ReadonlyUrl(urlString);
      expect(url.toString()).toBe(urlString);
    });

    test("should convert complex URL to string", () => {
      const urlString = "https://api.example.com:8080/v1/users?active=true&limit=10#results";
      const url = new ReadonlyUrl(urlString);
      expect(url.toString()).toBe(urlString);
    });

    test("should normalize URL string", () => {
      const url = new ReadonlyUrl("https://example.com//path//to//resource");
      // Native URL object normalizes the path
      expect(url.toString()).toBe("https://example.com//path//to//resource");
    });
  });

  describe("Lang parsing", () => {
    test("should default to 'en' when no lang query parameter", () => {
      const url = new ReadonlyUrl("https://example.com");
      expect(url.getLang()).toBe("en");
    });

    test("should parse valid lang query parameter", () => {
      const url = new ReadonlyUrl("https://example.com?lang=fr");
      expect(url.getLang()).toBe("fr");
    });

    test("should parse other valid locales", () => {
      const url = new ReadonlyUrl("https://example.com?lang=ja");
      expect(url.getLang()).toBe("ja");
    });

    test("should handle zh-tw locale", () => {
      const url = new ReadonlyUrl("https://example.com?lang=zh-tw");
      expect(url.getLang()).toBe("zh-tw");
    });

    test("should default to 'en' for invalid lang value", () => {
      const url = new ReadonlyUrl("https://example.com?lang=invalid");
      expect(url.getLang()).toBe("en");
    });
  });

  describe("Pagination parsing", () => {
    test("should default page to 1 when not specified", () => {
      const url = new ReadonlyUrl("https://example.com");
      expect(url.getPage()).toBe(1);
    });

    test("should parse page query parameter", () => {
      const url = new ReadonlyUrl("https://example.com?page=5");
      expect(url.getPage()).toBe(5);
    });

    test("should default limit to 100 when not specified", () => {
      const url = new ReadonlyUrl("https://example.com");
      expect(url.getLimit()).toBe(100);
    });

    test("should parse limit query parameter", () => {
      const url = new ReadonlyUrl("https://example.com?limit=25");
      expect(url.getLimit()).toBe(25);
    });

    test("should parse page and limit together", () => {
      const url = new ReadonlyUrl("https://example.com?page=3&limit=50");
      expect(url.getPage()).toBe(3);
      expect(url.getLimit()).toBe(50);
    });
  });

  describe("Order parsing", () => {
    test("should default order to 'ASC' when not specified", () => {
      const url = new ReadonlyUrl("https://example.com");
      expect(url.getOrder()).toBe("ASC");
    });

    test("should parse ASC order", () => {
      const url = new ReadonlyUrl("https://example.com?order=ASC");
      expect(url.getOrder()).toBe("ASC");
    });

    test("should parse DESC order", () => {
      const url = new ReadonlyUrl("https://example.com?order=DESC");
      expect(url.getOrder()).toBe("DESC");
    });

    test("should default to 'ASC' for invalid order value", () => {
      const url = new ReadonlyUrl("https://example.com?order=invalid");
      expect(url.getOrder()).toBe("ASC");
    });

    test("should default orderBy to null when not specified", () => {
      const url = new ReadonlyUrl("https://example.com");
      expect(url.getOrderBy()).toBeNull();
    });

    test("should parse orderBy query parameter", () => {
      const url = new ReadonlyUrl("https://example.com?orderBy=name");
      expect(url.getOrderBy()).toBe("name");
    });

    test("should parse order and orderBy together", () => {
      const url = new ReadonlyUrl("https://example.com?order=DESC&orderBy=createdAt");
      expect(url.getOrder()).toBe("DESC");
      expect(url.getOrderBy()).toBe("createdAt");
    });
  });

  describe("Search (q parameter)", () => {
    test("should default search to null when not specified", () => {
      const url = new ReadonlyUrl("https://example.com");
      expect(url.getSearch()).toBeNull();
    });

    test("should parse q query parameter", () => {
      const url = new ReadonlyUrl("https://example.com?q=hello");
      expect(url.getSearch()).toBe("hello");
    });

    test("should parse q with other parameters", () => {
      const url = new ReadonlyUrl("https://example.com?q=test&page=2&limit=10");
      expect(url.getSearch()).toBe("test");
      expect(url.getPage()).toBe(2);
      expect(url.getLimit()).toBe(10);
    });
  });

  describe("Bearer token parsing", () => {
    test("should default bearer token to null when not specified", () => {
      const url = new ReadonlyUrl("https://example.com");
      expect(url.getBearerToken()).toBeNull();
    });

    test("should parse bearerToken query parameter", () => {
      const url = new ReadonlyUrl("https://example.com?bearerToken=abc123");
      expect(url.getBearerToken()).toBe("abc123");
    });

    test("should decode URL-encoded bearer token", () => {
      const token = "abc def+ghi/jkl=mno";
      const encoded = encodeURIComponent(token);
      const url = new ReadonlyUrl(`https://example.com?bearerToken=${encoded}`);
      expect(url.getBearerToken()).toBe(token);
    });

    test("should decode bearer token with special characters", () => {
      const url = new ReadonlyUrl("https://example.com?bearerToken=Bearer%20eyJhbGciOiJIUzI1NiJ9");
      expect(url.getBearerToken()).toBe("Bearer eyJhbGciOiJIUzI1NiJ9");
    });

    test("should return null for empty bearer token", () => {
      const url = new ReadonlyUrl("https://example.com?bearerToken=");
      expect(url.getBearerToken()).toBeNull();
    });

    test("should parse bearer token alongside other parameters", () => {
      const url = new ReadonlyUrl("https://example.com?bearerToken=token123&page=2&q=search");
      expect(url.getBearerToken()).toBe("token123");
      expect(url.getPage()).toBe(2);
      expect(url.getSearch()).toBe("search");
    });
  });

  describe("Edge cases and special URLs", () => {
    test("should handle file:// protocol", () => {
      const url = new ReadonlyUrl("file:///path/to/file.txt");
      expect(url.getProtocol()).toBe("file");
      expect(url.getPath()).toBe("/path/to/file.txt");
    });

    test("should handle data: URLs", () => {
      const url = new ReadonlyUrl("data:text/plain;base64,SGVsbG8gV29ybGQ=");
      expect(url.getProtocol()).toBe("data");
      expect(url.getHostname()).toBe("");
    });

    test("should handle mailto: URLs", () => {
      const url = new ReadonlyUrl("mailto:test@example.com");
      expect(url.getProtocol()).toBe("mailto");
    });

    test("should handle URLs with international domain names", () => {
      const url = new ReadonlyUrl("https://xn--e1afmkfd.xn--p1ai/");
      expect(url.getProtocol()).toBe("https");
      expect(url.getHostname()).toBe("xn--e1afmkfd.xn--p1ai");
    });

    test("should handle URLs with very long paths", () => {
      const longPath = `/very/long/path/${"segment/".repeat(100)}`;
      const url = new ReadonlyUrl(`https://example.com${longPath}`);
      expect(url.getPath()).toBe(longPath.slice(0, -1)); // Remove trailing slash
    });

    test("should handle URLs with many query parameters", () => {
      let queryString = "?";
      for (let i = 0; i < 50; i++) {
        queryString += `param${i}=value${i}&`;
      }
      queryString = queryString.slice(0, -1); // Remove trailing &

      const url = new ReadonlyUrl(`https://example.com${queryString}`);
      const queries = url.getQueries();
      expect(Object.keys(queries)).toHaveLength(50);
      expect(queries.param0).toBe("value0");
      expect(queries.param49).toBe("value49");
    });
  });

  describe("Immutability", () => {
    test("should not allow modification of returned queries object", () => {
      const url = new ReadonlyUrl("https://example.com?name=john");
      const queries = url.getQueries();
      queries.age = 25;

      // Original queries should be unchanged
      const freshQueries = url.getQueries();
      expect(freshQueries.age).toBeUndefined();
      expect(freshQueries.name).toBe("john");
    });

    test("should maintain immutability across multiple getter calls", () => {
      const url = new ReadonlyUrl("https://api.example.com:8080/users?active=true#list");

      expect(url.getProtocol()).toBe("https");
      expect(url.getHostname()).toBe("api.example.com");
      expect(url.getPort()).toBe(8080);
      expect(url.getPath()).toBe("/users");
      expect(url.getQueries().active).toBe(true);
      expect(url.getFragment()).toBe("list");

      // All values should remain consistent
      expect(url.getProtocol()).toBe("https");
      expect(url.getHostname()).toBe("api.example.com");
      expect(url.getPort()).toBe(8080);
    });
  });
});
