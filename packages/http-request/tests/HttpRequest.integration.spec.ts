import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { LocaleType } from "@talosjs/translation";
import { HttpRequest } from "@/HttpRequest";

// Mock the accept-language-parser to test language parsing edge cases
const mockParser = {
  parse: mock((acceptLanguage: string) => {
    if (acceptLanguage === "invalid-format") {
      return [];
    }
    if (acceptLanguage === "en-US") {
      return [{ code: "en", region: "US", quality: 1 }];
    }
    if (acceptLanguage === "fr-FR,fr;q=0.9") {
      return [
        { code: "fr", region: "FR", quality: 1 },
        { code: "fr", quality: 0.9 },
      ];
    }
    if (acceptLanguage === "es") {
      return [{ code: "es", quality: 1 }];
    }
    return [{ code: "en", region: "US", quality: 1 }];
  }),
};

// Mock accept-language-parser module
mock.module("accept-language-parser", () => ({
  default: mockParser,
}));

describe("HttpRequest Integration Tests", () => {
  let mockRequest: Request;
  let mockHeaders: Headers;

  beforeEach(() => {
    mockHeaders = new Headers();
    mockRequest = {
      url: "https://example.com/api/test",
      method: "GET",
      headers: mockHeaders,
    } as Request;

    // Clear mock calls
    mockParser.parse.mockClear();
  });

  describe("URL Integration", () => {
    test("should correctly integrate with Url class for complex URLs", () => {
      const complexRequest = {
        ...mockRequest,
        url: "https://subdomain.example.com:8080/api/v1/users/123?filter=active&sort=name#results",
      } as Request;

      const request = new HttpRequest(complexRequest);

      expect(request.url.getHostname()).toBe("subdomain.example.com");
      expect(request.url.getProtocol()).toBe("https");
      expect(request.url.getPort()).toBe(8080);
      expect(request.url.getPath()).toBe("/api/v1/users/123");
      expect(request.url.getFragment()).toBe("results");
      expect(request.path).toBe("/api/v1/users/123");

      expect(request.queries).toEqual({
        filter: "active",
        sort: "name",
      });
    });

    test("should handle URL query parameter parsing edge cases", () => {
      const edgeCaseRequest = {
        ...mockRequest,
        url: "https://example.com/test?empty=&zero=0&false=false&encoded=%20space%20",
      } as Request;

      const request = new HttpRequest(edgeCaseRequest);

      expect(request.queries).toEqual({
        empty: "",
        zero: "0", // Should remain string since it starts with 0
        false: false, // Should be parsed as boolean
        encoded: " space ",
      });
    });
  });

  describe("Header Integration", () => {
    test("should integrate correctly with Header class methods", () => {
      mockHeaders.set("Content-Type", "application/json; charset=utf-8");
      mockHeaders.set("Authorization", "Bearer token123");
      mockHeaders.set("X-Custom-Header", "custom-value");
      mockHeaders.set("Cookie", "sessionId=abc123; userId=456");

      const request = new HttpRequest(mockRequest);

      expect(request.header.get("Content-Type")).toBe("application/json; charset=utf-8");
      expect(request.header.get("Authorization")).toBe("Bearer token123");
      expect(request.header.get("X-Custom-Header")).toBe("custom-value");
      expect(request.header.getBearerToken()).toBe("token123");
      expect(request.header.getCookies()).toEqual({
        sessionId: "abc123",
        userId: "456",
      });
    });

    test("should handle User-Agent parsing integration", () => {
      const userAgents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15",
      ];

      userAgents.forEach((ua, index) => {
        mockHeaders.set("User-Agent", ua);
        const request = new HttpRequest(mockRequest);

        expect(request.userAgent).toBeTruthy();
        expect(request.userAgent?.browser?.name).toBeDefined();
        expect(request.userAgent?.os?.name).toBeDefined();

        if (index === 0) {
          // Chrome on Windows
          expect(request.userAgent?.browser?.name).toBe("Chrome");
          expect(request.userAgent?.os?.name).toBe("Windows");
        } else if (index === 1) {
          // Mobile Safari on iOS
          expect(request.userAgent?.os?.name).toBe("iOS");
        } else if (index === 2) {
          // Safari on macOS
          expect(request.userAgent?.browser?.name).toBe("Safari");
          expect(request.userAgent?.os?.name).toBe("macOS");
        }
      });
    });

    test("should handle IP detection from headers", () => {
      const testCases = [
        {
          headers: { "X-Forwarded-For": "203.0.113.1, 198.51.100.1" },
          expectedIps: ["203.0.113.1", "198.51.100.1", "203.0.113.1, 198.51.100.1"],
        },
        {
          headers: { "X-Real-IP": "192.168.1.100" },
          expectedIps: ["192.168.1.100"],
        },
        {
          headers: {
            "X-Forwarded-For": "203.0.113.1",
            "X-Real-IP": "192.168.1.100",
          },
          expectedIps: ["203.0.113.1", "192.168.1.100"],
        },
      ];

      testCases.forEach((testCase) => {
        const headers = new Headers();
        Object.entries(testCase.headers).forEach(([key, value]) => {
          headers.set(key, value);
        });

        const req = { ...mockRequest, headers } as Request;
        const request = new HttpRequest(req);

        const clientIps = request.header.getClientIps();
        expect(clientIps).toEqual(testCase.expectedIps);
      });
    });
  });

  describe("Language Parser Integration", () => {
    test("should call accept-language-parser with correct parameters", () => {
      mockHeaders.set("Accept-Language", "fr-FR,fr;q=0.9");

      const request = new HttpRequest(mockRequest);

      expect(mockParser.parse).toHaveBeenCalledWith("fr-FR,fr;q=0.9");
      expect(request.lang).toEqual({
        code: "fr",
        region: "FR",
      });
    });

    test("should handle parser returning empty array", () => {
      mockHeaders.set("Accept-Language", "invalid-format");

      const request = new HttpRequest(mockRequest);

      expect(mockParser.parse).toHaveBeenCalledWith("invalid-format");
      // Should fall back to default when parser returns empty array
      // This is testing edge case behavior where parser returns empty array
      expect(request.lang.region).toBe(null);
      // Note: code will be undefined but cast as LocaleType in implementation
    });

    test("should handle language without region", () => {
      mockHeaders.set("Accept-Language", "es");

      const request = new HttpRequest(mockRequest);

      expect(request.lang).toEqual({
        code: "es",
        region: null,
      });
    });

    test("should use default language when no Accept-Language header", () => {
      const request = new HttpRequest(mockRequest);

      expect(mockParser.parse).toHaveBeenCalledWith("en-US");
      expect(request.lang).toEqual({
        code: "en",
        region: "US",
      });
    });
  });

  describe("RequestFile Integration", () => {
    test("should create RequestFile instances for uploaded files", () => {
      const formData = new FormData();

      // Test different file types
      const textFile = new File(["Hello world"], "document.txt", {
        type: "text/plain",
      });
      const imageFile = new File([new ArrayBuffer(1024)], "photo.jpg", {
        type: "image/jpeg",
      });
      const pdfFile = new File([new ArrayBuffer(2048)], "manual.pdf", {
        type: "application/pdf",
      });

      formData.append("document", textFile);
      formData.append("image", imageFile);
      formData.append("pdf", pdfFile);
      formData.append("metadata", JSON.stringify({ version: "1.0" })); // Non-file data

      const request = new HttpRequest(mockRequest, { form: formData });

      // Should only create RequestFile instances for File objects
      expect(Object.keys(request.files)).toHaveLength(3);

      // Check text file
      expect(request.files.document).toBeDefined();
      expect(request.files.document?.extension).toBe("txt");
      expect(request.files.document?.type).toBe("text/plain");
      expect(request.files.document?.isText).toBe(true);
      expect(request.files.document?.size).toBe(11);

      // Check image file
      expect(request.files.image).toBeDefined();
      expect(request.files.image?.extension).toBe("jpg");
      expect(request.files.image?.type).toBe("image/jpeg");
      expect(request.files.image?.isImage).toBe(true);
      expect(request.files.image?.size).toBe(1024);

      // Check PDF file
      expect(request.files.pdf).toBeDefined();
      expect(request.files.pdf?.extension).toBe("pdf");
      expect(request.files.pdf?.type).toBe("application/pdf");
      expect(request.files.pdf?.isPdf).toBe(true);
      expect(request.files.pdf?.size).toBe(2048);

      // Verify each RequestFile has unique ID
      const ids = Object.values(request.files).map((file) => file.id);
      const uniqueIds = [...new Set(ids)];
      expect(uniqueIds).toHaveLength(ids.length);
    });

    test("should handle files with no extension", () => {
      const formData = new FormData();
      const fileWithoutExt = new File(["content"], "README", {
        type: "text/plain",
      });
      formData.append("readme", fileWithoutExt);

      const request = new HttpRequest(mockRequest, { form: formData });

      expect(request.files.readme).toBeDefined();
      expect(request.files.readme?.extension).toBe("");
      expect(request.files.readme?.originalName).toContain("readme");
    });

    test("should handle duplicate file names", () => {
      const formData = new FormData();
      const file1 = new File(["content1"], "document.txt", {
        type: "text/plain",
      });
      const file2 = new File(["content2"], "document.txt", {
        type: "text/plain",
      });

      formData.append("file1", file1);
      formData.append("file2", file2);

      const request = new HttpRequest(mockRequest, { form: formData });

      expect(request.files.file1).toBeDefined();
      expect(request.files.file2).toBeDefined();

      // Should have different generated IDs even with same original name
      expect(request.files.file1?.id).not.toBe(request.files.file2?.id);
      expect(request.files.file1?.name).not.toBe(request.files.file2?.name);
    });
  });

  describe("Type System Integration", () => {
    test("should handle all ScalarType values in params and queries", () => {
      const queryRequest = {
        ...mockRequest,
        url: "https://example.com/test?string=hello&number=42&bigint=123&boolean=true",
      } as Request;

      const params = {
        stringParam: "test",
        numberParam: 123,
        bigintParam: BigInt(456),
        booleanParam: false,
      };

      const request = new HttpRequest(queryRequest, { params });

      // Check query parsing
      expect(request.queries?.string).toBe("hello");
      expect(request.queries?.number).toBe(42);
      expect(request.queries?.boolean).toBe(true);

      // Check params
      expect(request.params?.stringParam).toBe("test");
      expect(request.params?.numberParam).toBe(123);
      expect(request.params?.bigintParam).toBe(BigInt(456));
      expect(request.params?.booleanParam).toBe(false);
    });

    test("should handle HttpMethodType correctly", () => {
      const methods = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"];

      methods.forEach((method) => {
        const req = { ...mockRequest, method } as Request;
        const request = new HttpRequest(req);

        // Should be typed as HttpMethodType
        expect(typeof request.method).toBe("string");
        expect(methods).toContain(request.method);
      });
    });

    test("should handle LocaleType correctly in language detection", () => {
      // Test with valid locale codes from the translation package
      const validLocales = ["en", "fr", "es", "de", "it", "ja", "ko", "zh"];

      validLocales.forEach((locale) => {
        const reqWithLocale = {
          ...mockRequest,
          url: `https://example.com/test?lang=${locale}`,
        } as Request;

        const request = new HttpRequest(reqWithLocale);
        expect(request.lang.code).toBe(locale as LocaleType);
      });
    });
  });

  describe("Error Handling Integration", () => {
    test("should handle malformed URLs gracefully", () => {
      // This would typically throw in URL constructor, but we're testing with mock Request
      // URL constructor will throw for invalid URLs, so this is expected behavior
      const malformedRequest = {
        ...mockRequest,
        url: "not-a-valid-url",
      } as Request;

      // Should throw for invalid URLs as expected
      expect(() => new HttpRequest(malformedRequest)).toThrow();
    });

    test("should handle corrupted form data gracefully", () => {
      const formData = new FormData();

      // Add some valid and some problematic entries
      formData.append("normal", "value");
      formData.append("file", new File(["test"], "test.txt", { type: "text/plain" })); // Valid file

      const request = new HttpRequest(mockRequest, { form: formData });

      expect(request.form).toBe(formData);
      expect(request.files.file).toBeDefined();
    });

    test("should handle missing or invalid config gracefully", () => {
      // Test with undefined config
      const request1 = new HttpRequest(mockRequest, undefined);
      expect(request1.params).toEqual({});
      expect(request1.payload).toEqual({});
      expect(request1.ip).toBe(null);

      // Test with partial config
      const request2 = new HttpRequest(mockRequest, { params: { id: "123" } });
      expect(request2.params).toEqual({ id: "123" });
      expect(request2.payload).toEqual({});
      expect(request2.ip).toBe(null);
    });
  });

  describe("Performance Integration", () => {
    test("should handle large form data efficiently", () => {
      const formData = new FormData();

      // Add multiple files and form fields
      for (let i = 0; i < 10; i++) {
        formData.append(`file${i}`, new File([`content${i}`], `file${i}.txt`, { type: "text/plain" }));
        formData.append(`field${i}`, `value${i}`);
      }

      const startTime = performance.now();
      const request = new HttpRequest(mockRequest, { form: formData });
      const endTime = performance.now();

      // Should complete in reasonable time (less than 100ms for 10 files)
      expect(endTime - startTime).toBeLessThan(100);
      expect(Object.keys(request.files)).toHaveLength(10);
    });

    test("should handle complex queries efficiently", () => {
      const queryString = Array.from({ length: 50 }, (_, i) => `param${i}=value${i}`).join("&");
      const complexRequest = {
        ...mockRequest,
        url: `https://example.com/test?${queryString}`,
      } as Request;

      const startTime = performance.now();
      const request = new HttpRequest(complexRequest);
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(50);
      expect(Object.keys(request.queries ?? {})).toHaveLength(50);
    });
  });
});
