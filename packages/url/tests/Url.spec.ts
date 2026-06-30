import { describe, expect, test } from "bun:test";
import { ReadonlyUrl, Url } from "@/index";

describe("ReadonlyUrl", () => {
  test("should parse a basic URL correctly", () => {
    const url = new ReadonlyUrl("https://example.com/path?query=value#fragment");

    expect(url.getProtocol()).toBe("https");
    expect(url.getDomain()).toBe("example.com");
    expect(url.getSubdomain()).toBe(null);
    expect(url.getPath()).toBe("/path");
    expect(url.getQueries().query).toBe("value");
    expect(url.getFragment()).toBe("fragment");
    expect(url.getPort()).toBe(80);
    expect(url.getBase()).toBe("https://example.com");
    expect(url.getOrigin()).toBe("https://example.com");
  });

  test("should parse base correctly", () => {
    let url = new ReadonlyUrl("https://blog.example.com");
    expect(url.getBase()).toBe("https://blog.example.com");
    url = new ReadonlyUrl("https://blog.example.com:3000");
    expect(url.getBase()).toBe("https://blog.example.com:3000");
  });

  test("should parse hostname correctly", () => {
    let url = new ReadonlyUrl("https://blog.example.com");
    expect(url.getHostname()).toBe("blog.example.com");
    url = new ReadonlyUrl("https://blog.example.com:3000");
    expect(url.getHostname()).toBe("blog.example.com");
  });

  test("should parse subdomain correctly", () => {
    const url = new ReadonlyUrl("https://blog.example.com");

    expect(url.getSubdomain()).toBe("blog");
    expect(url.getDomain()).toBe("example.com");
  });

  test("should parse multiple subdomains correctly", () => {
    const url = new ReadonlyUrl("https://dev.blog.example.com");

    expect(url.getSubdomain()).toBe("dev.blog");
    expect(url.getDomain()).toBe("example.com");
  });

  test("should parse custom port correctly", () => {
    const url = new ReadonlyUrl("http://localhost:3000");

    expect(url.getPort()).toBe(3000);
    expect(url.getDomain()).toBe("localhost");
  });

  test("should parse multiple query parameters correctly", () => {
    const url = new ReadonlyUrl("https://example.com?name=john&age=25&active=true");

    expect(url.getQueries().name).toBe("john");
    expect(url.getQueries().age).toBe(25);
    expect(url.getQueries().active).toBe(true);
  });

  test("should accept URL object as input", () => {
    const nativeUrl = new URL("https://example.com/test");
    const url = new ReadonlyUrl(nativeUrl);

    expect(url.getDomain()).toBe("example.com");
    expect(url.getPath()).toBe("/test");
  });

  test("should handle URLs without path, query or fragment", () => {
    const url = new ReadonlyUrl("https://example.com");

    expect(url.getPath()).toBe("/");
    expect(url.getQueries()).toEqual({});
    expect(url.getFragment()).toBe("");
  });

  test("should return native URL object", () => {
    const urlString = "https://example.com/test";
    const url = new ReadonlyUrl(urlString);
    const native = url.getNative();

    expect(native).toBeInstanceOf(URL);
    expect(native.href).toBe(urlString);
  });

  test("should convert to string correctly", () => {
    const urlString = "https://example.com/test?param=value#section";
    const url = new ReadonlyUrl(urlString);

    expect(url.toString()).toBe(urlString);
  });
});

describe("Url (Mutable)", () => {
  test("should set protocol correctly", () => {
    const url = new Url("https://example.com");

    url.setProtocol("http");
    expect(url.getProtocol()).toBe("http");
    expect(url.toString()).toBe("http://example.com/");

    // Test with colon
    url.setProtocol("https:");
    expect(url.getProtocol()).toBe("https");
    expect(url.toString()).toBe("https://example.com/");
  });

  test("should set hostname correctly", () => {
    const url = new Url("https://example.com");

    url.setHostname("test.com");
    expect(url.getHostname()).toBe("test.com");
    expect(url.getDomain()).toBe("test.com");
    expect(url.getSubdomain()).toBe(null);
    expect(url.toString()).toBe("https://test.com/");
  });

  test("should set hostname with subdomain correctly", () => {
    const url = new Url("https://example.com");

    url.setHostname("api.blog.test.com");
    expect(url.getHostname()).toBe("api.blog.test.com");
    expect(url.getDomain()).toBe("test.com");
    expect(url.getSubdomain()).toBe("api.blog");
    expect(url.toString()).toBe("https://api.blog.test.com/");
  });

  test("should set port correctly", () => {
    const url = new Url("https://example.com");

    url.setPort(8080);
    expect(url.getPort()).toBe(8080);
    expect(url.toString()).toBe("https://example.com:8080/");
  });

  test("should not show default ports in URL", () => {
    const httpUrl = new Url("http://example.com");
    httpUrl.setPort(80);
    expect(httpUrl.toString()).toBe("http://example.com/");

    const httpsUrl = new Url("https://example.com");
    httpsUrl.setPort(443);
    expect(httpsUrl.toString()).toBe("https://example.com/");
  });

  test("should set path correctly", () => {
    const url = new Url("https://example.com");

    url.setPath("api/users");
    expect(url.getPath()).toBe("/api/users");
    expect(url.toString()).toBe("https://example.com/api/users");

    // Test with leading/trailing slashes
    url.setPath("/admin/dashboard/");
    expect(url.getPath()).toBe("/admin/dashboard");
    expect(url.toString()).toBe("https://example.com/admin/dashboard");
  });

  test("should set fragment correctly", () => {
    const url = new Url("https://example.com");

    url.setFragment("section1");
    expect(url.getFragment()).toBe("section1");
    expect(url.toString()).toBe("https://example.com/#section1");

    // Test with hash prefix
    url.setFragment("#section2");
    expect(url.getFragment()).toBe("section2");
    expect(url.toString()).toBe("https://example.com/#section2");
  });

  test("should add query parameters", () => {
    const url = new Url("https://example.com");

    url.addQuery("name", "john");
    expect(url.getQueries().name).toBe("john");
    expect(url.toString()).toBe("https://example.com/?name=john");

    url.addQuery("age", 25);
    expect(url.getQueries().age).toBe(25);
    expect(url.toString()).toBe("https://example.com/?name=john&age=25");

    url.addQuery("active", true);
    expect(url.getQueries().active).toBe(true);
    expect(url.toString()).toBe("https://example.com/?name=john&age=25&active=true");
  });

  test("should remove query parameters", () => {
    const url = new Url("https://example.com?name=john&age=25&active=true");

    url.removeQuery("age");
    expect(url.getQueries().age).toBeUndefined();
    expect(url.getQueries().name).toBe("john");
    expect(url.getQueries().active).toBe(true);
    expect(url.toString()).toBe("https://example.com/?name=john&active=true");
  });

  test("should set queries object", () => {
    const url = new Url("https://example.com?old=value");

    url.setQueries({ new: "data", count: 5 });
    expect(url.getQueries()).toEqual({ new: "data", count: 5 });
    expect(url.getQueries().old).toBeUndefined();
    expect(url.toString()).toBe("https://example.com/?new=data&count=5");
  });

  test("should clear all queries", () => {
    const url = new Url("https://example.com?name=john&age=25");

    url.clearQueries();
    expect(url.getQueries()).toEqual({});
    expect(url.toString()).toBe("https://example.com/");
  });

  test("should chain method calls", () => {
    const url = new Url("https://example.com");

    url
      .setProtocol("http")
      .setHostname("api.test.com")
      .setPort(3000)
      .setPath("v1/users")
      .addQuery("limit", 10)
      .addQuery("page", 1)
      .setFragment("results");

    expect(url.getProtocol()).toBe("http");
    expect(url.getHostname()).toBe("api.test.com");
    expect(url.getDomain()).toBe("test.com");
    expect(url.getSubdomain()).toBe("api");
    expect(url.getPort()).toBe(3000);
    expect(url.getPath()).toBe("/v1/users");
    expect(url.getQueries()).toEqual({ limit: 10, page: 1 });
    expect(url.getFragment()).toBe("results");
    expect(url.toString()).toBe("http://api.test.com:3000/v1/users?limit=10&page=1#results");
  });

  test("should handle complex URL modifications", () => {
    const url = new Url("https://old.example.com:8080/old/path?old=param#old");

    url
      .setProtocol("http")
      .setHostname("new.domain.com")
      .setPort(3000)
      .setPath("new/api/endpoint")
      .clearQueries()
      .addQuery("token", "abc123")
      .addQuery("version", 2)
      .setFragment("updated");

    expect(url.toString()).toBe("http://new.domain.com:3000/new/api/endpoint?token=abc123&version=2#updated");
  });

  test("should handle empty values correctly", () => {
    const url = new Url("https://example.com/path?param=value#fragment");

    url.setPath("");
    expect(url.getPath()).toBe("/");

    url.setFragment("");
    expect(url.getFragment()).toBe("");

    // Clear queries to get a clean URL
    url.clearQueries();
    expect(url.toString()).toBe("https://example.com/");
  });

  test("should preserve base and origin after mutations", () => {
    const url = new Url("https://example.com");

    url.setPath("api/test").addQuery("id", 123);
    expect(url.getBase()).toBe("https://example.com");
    expect(url.getOrigin()).toBe("https://example.com");

    url.setHostname("api.test.com").setPort(8080);
    expect(url.getBase()).toBe("https://api.test.com:8080");
    expect(url.getOrigin()).toBe("https://api.test.com:8080");
  });
});
