import { beforeEach, describe, expect, test } from "bun:test";
import type { HttpMethodType } from "@talosjs/types";
import { HttpRequest } from "@/HttpRequest";

describe("HttpRequest", () => {
  let mockRequest: Request;
  let mockHeaders: Headers;

  beforeEach(() => {
    mockHeaders = new Headers();
    mockRequest = {
      url: "https://example.com/api/users?page=1&limit=10",
      method: "GET",
      headers: mockHeaders,
    } as Request;
  });

  describe("Basic Properties", () => {
    test("should initialize with correct basic properties", () => {
      const request = new HttpRequest(mockRequest);

      expect(request.native).toBe(mockRequest);
      expect(request.method).toBe("GET");
      expect(request.path).toBe("/api/users");
      expect(request.host).toBe("");
      expect(request.ip).toBe(null);
    });

    test("should handle different HTTP methods", () => {
      const methods: HttpMethodType[] = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"];

      methods.forEach((method) => {
        const req = { ...mockRequest, method: method.toLowerCase() } as Request;
        const request = new HttpRequest(req);
        expect(request.method).toBe(method);
      });
    });

    test("should parse URL correctly", () => {
      const request = new HttpRequest(mockRequest);

      expect(request.url.getHostname()).toBe("example.com");
      expect(request.url.getProtocol()).toBe("https");
      expect(request.url.getPath()).toBe("/api/users");
    });

    test("should handle URL with port", () => {
      const reqWithPort = {
        ...mockRequest,
        url: "http://localhost:3000/api/test",
      } as Request;

      const request = new HttpRequest(reqWithPort);
      expect(request.url.getHostname()).toBe("localhost");
      expect(request.url.getPort()).toBe(3000);
      expect(request.path).toBe("/api/test");
    });
  });

  describe("Query Parameters", () => {
    test("should parse query parameters correctly", () => {
      const request = new HttpRequest(mockRequest);

      expect(request.queries).toEqual({
        page: 1,
        limit: 10,
      });
    });

    test("should handle URL without query parameters", () => {
      const reqWithoutQuery = {
        ...mockRequest,
        url: "https://example.com/api/users",
      } as Request;

      const request = new HttpRequest(reqWithoutQuery);
      expect(request.queries).toEqual({});
    });

    test("should parse different query parameter types", () => {
      const reqWithDifferentTypes = {
        ...mockRequest,
        url: "https://example.com/test?string=hello&number=42&boolean=true&float=3.14",
      } as Request;

      const request = new HttpRequest(reqWithDifferentTypes);
      expect(request.queries).toEqual({
        string: "hello",
        number: 42,
        boolean: true,
        float: 3.14,
      });
    });
  });

  describe("Headers", () => {
    test("should handle Host header", () => {
      mockHeaders.set("Host", "api.example.com");
      const request = new HttpRequest(mockRequest);

      expect(request.host).toBe("api.example.com");
    });

    test("should handle missing Host header", () => {
      const request = new HttpRequest(mockRequest);
      expect(request.host).toBe("");
    });

    test("should get User-Agent", () => {
      mockHeaders.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
      const request = new HttpRequest(mockRequest);

      expect(request.userAgent).toBeTruthy();
      expect(request.userAgent?.browser?.name).toBeDefined();
    });

    test("should handle missing User-Agent", () => {
      const request = new HttpRequest(mockRequest);
      expect(request.userAgent).toBe(null);
    });
  });

  describe("Language Detection", () => {
    test("should use custom language from query parameter 'lang'", () => {
      const reqWithLang = {
        ...mockRequest,
        url: "https://example.com/api/users?lang=fr",
      } as Request;

      const request = new HttpRequest(reqWithLang);
      expect(request.lang).toEqual({
        code: "fr",
        region: null,
      });
    });

    test("should use custom language from query parameter 'locale'", () => {
      const reqWithLocale = {
        ...mockRequest,
        url: "https://example.com/api/users?locale=es",
      } as Request;

      const request = new HttpRequest(reqWithLocale);
      expect(request.lang).toEqual({
        code: "es",
        region: null,
      });
    });

    test("should use custom language from X-Custom-Lang header", () => {
      mockHeaders.set("X-Custom-Lang", "de");
      const request = new HttpRequest(mockRequest);

      expect(request.lang).toEqual({
        code: "de",
        region: null,
      });
    });

    test("should parse Accept-Language header", () => {
      mockHeaders.set("Accept-Language", "en-US,en;q=0.9,fr;q=0.8");
      const request = new HttpRequest(mockRequest);

      expect(request.lang).toEqual({
        code: "en",
        region: "US",
      });
    });

    test("should default to en-US when no language info is available", () => {
      const request = new HttpRequest(mockRequest);

      expect(request.lang).toEqual({
        code: "en",
        region: "US",
      });
    });

    test("should handle malformed Accept-Language header", () => {
      mockHeaders.set("Accept-Language", "");
      const request = new HttpRequest(mockRequest);

      expect(request.lang).toEqual({
        code: "en",
        region: "US",
      });
    });

    test("should prioritize query params over headers", () => {
      mockHeaders.set("Accept-Language", "fr-FR,fr;q=0.9");
      mockHeaders.set("X-Custom-Lang", "de");

      const reqWithLang = {
        ...mockRequest,
        url: "https://example.com/api/users?lang=ja",
      } as Request;

      const request = new HttpRequest(reqWithLang);
      expect(request.lang).toEqual({
        code: "ja",
        region: null,
      });
    });
  });

  describe("Configuration Options", () => {
    test("should handle params configuration", () => {
      const params = { userId: "123", groupId: "456" };
      const request = new HttpRequest(mockRequest, { params });

      expect(request.params).toEqual(params);
    });

    test("should handle payload configuration", () => {
      const payload = { name: "John", email: "john@example.com" };
      const request = new HttpRequest(mockRequest, { payload });

      expect(request.payload).toEqual(payload);
    });

    test("should handle IP configuration", () => {
      const ip = "192.168.1.1";
      const request = new HttpRequest(mockRequest, { ip });

      expect(request.ip).toBe(ip);
    });

    test("should default params to empty object", () => {
      const request = new HttpRequest(mockRequest);
      expect(request.params).toEqual({});
    });

    test("should default payload to empty object", () => {
      const request = new HttpRequest(mockRequest);
      expect(request.payload).toEqual({});
    });
  });

  describe("Form Data and Files", () => {
    test("should handle form data without files", () => {
      const formData = new FormData();
      formData.append("name", "John");
      formData.append("age", "25");

      const request = new HttpRequest(mockRequest, { form: formData });

      expect(request.form).toBe(formData);
      expect(request.files).toEqual({});
    });

    test("should extract files from form data", () => {
      const formData = new FormData();
      const file = new File(["content"], "test.txt", { type: "text/plain" });
      formData.append("document", file);
      formData.append("name", "John");

      const request = new HttpRequest(mockRequest, { form: formData });

      expect(request.form).toBe(formData);
      expect(request.files.document).toBeDefined();
      expect(request.files.document?.originalName).toContain("test");
      expect(request.files.document?.extension).toBe("txt");
      expect(request.files.document?.type).toBe("text/plain");
    });

    test("should handle multiple files", () => {
      const formData = new FormData();
      const file1 = new File(["content1"], "test1.txt", { type: "text/plain" });
      const file2 = new File(["content2"], "test2.jpg", { type: "image/jpeg" });

      formData.append("doc1", file1);
      formData.append("doc2", file2);

      const request = new HttpRequest(mockRequest, { form: formData });

      expect(Object.keys(request.files)).toHaveLength(2);
      expect(request.files.doc1).toBeDefined();
      expect(request.files.doc2).toBeDefined();
      expect(request.files.doc1?.extension).toBe("txt");
      expect(request.files.doc2?.extension).toBe("jpg");
    });

    test("should handle null form data", () => {
      const request = new HttpRequest(mockRequest, { form: null });

      expect(request.form).toBe(null);
      expect(request.files).toEqual({});
    });

    test("should handle missing form configuration", () => {
      const request = new HttpRequest(mockRequest);

      expect(request.form).toBe(null);
      expect(request.files).toEqual({});
    });
  });

  describe("Edge Cases", () => {
    test("should handle URL with fragment", () => {
      const reqWithFragment = {
        ...mockRequest,
        url: "https://example.com/page#section1",
      } as Request;

      const request = new HttpRequest(reqWithFragment);
      expect(request.url.getFragment()).toBe("section1");
    });

    test("should handle URL with special characters in path", () => {
      const reqWithSpecialChars = {
        ...mockRequest,
        url: "https://example.com/api/users/José%20María",
      } as Request;

      const request = new HttpRequest(reqWithSpecialChars);
      expect(request.path).toBe("/api/users/Jos%C3%A9%20Mar%C3%ADa");
    });

    test("should handle empty path", () => {
      const reqWithEmptyPath = {
        ...mockRequest,
        url: "https://example.com/",
      } as Request;

      const request = new HttpRequest(reqWithEmptyPath);
      expect(request.path).toBe("/");
    });

    test("should handle URL with authentication", () => {
      const reqWithAuth = {
        ...mockRequest,
        url: "https://user:pass@example.com/api/users",
      } as Request;

      const request = new HttpRequest(reqWithAuth);
      expect(request.url.getHostname()).toBe("example.com");
      expect(request.path).toBe("/api/users");
    });

    test("should handle complex Accept-Language header", () => {
      mockHeaders.set("Accept-Language", "fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5");
      const request = new HttpRequest(mockRequest);

      // Parser picks the highest quality entry, "fr-CH", as the primary language
      expect(request.lang).toEqual({
        code: "fr",
        region: "CH",
      });
    });

    test("should handle IPv6 addresses", () => {
      const reqWithIPv6 = {
        ...mockRequest,
        url: "http://[::1]:8080/api/test",
      } as Request;

      const request = new HttpRequest(reqWithIPv6);
      expect(request.url.getHostname()).toBe("[::1]");
      expect(request.url.getPort()).toBe(8080);
    });
  });

  describe("Complete Integration", () => {
    test("should handle a complex real-world request", () => {
      const complexHeaders = new Headers();
      complexHeaders.set("Host", "api.myapp.com");
      complexHeaders.set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36");
      complexHeaders.set("Accept-Language", "en-US,en;q=0.9,es;q=0.8");
      complexHeaders.set("X-Forwarded-For", "203.0.113.1");

      const complexRequest = {
        url: "https://api.myapp.com/v1/users/profile?include=posts&sort=created_at&lang=fr",
        method: "POST",
        headers: complexHeaders,
      } as Request;

      const formData = new FormData();
      formData.append("avatar", new File(["data"], "avatar.jpg", { type: "image/jpeg" }));
      formData.append("bio", "Updated bio text");

      const request = new HttpRequest(complexRequest, {
        params: { userId: "user123" },
        payload: { action: "update_profile" },
        form: formData,
        ip: "192.168.1.100",
      });

      // Verify all properties are correctly set
      expect(request.method).toBe("POST");
      expect(request.path).toBe("/v1/users/profile");
      expect(request.host).toBe("api.myapp.com");
      expect(request.ip).toBe("192.168.1.100");

      // Language should prioritize query param
      expect(request.lang).toEqual({
        code: "fr",
        region: null,
      });

      // Check queries
      expect(request.queries).toEqual({
        include: "posts",
        sort: "created_at",
        lang: "fr",
      });

      // Check configuration
      expect(request.params).toEqual({ userId: "user123" });
      expect(request.payload).toEqual({ action: "update_profile" });

      // Check files
      expect(request.files.avatar).toBeDefined();
      expect(request.files.avatar?.type).toBe("image/jpeg");

      // Check user agent
      expect(request.userAgent).toBeTruthy();
      expect(request.userAgent?.os?.name).toBeDefined();
    });
  });
});
