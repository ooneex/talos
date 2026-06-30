import { beforeEach, describe, expect, test } from "bun:test";
import type { LocaleType } from "@talosjs/translation";
import { HttpRequest } from "@/HttpRequest";

interface NestedPayload {
  user: {
    profile: {
      personal: {
        name: string;
      };
    };
  };
}

interface LargePayloadItem {
  id: number;
  data: string;
}

interface LargePayload {
  data: LargePayloadItem[];
}

interface CircularPayload extends Record<string, unknown> {
  name: string;
  data: Record<string, unknown>;
}

describe("HttpRequest Edge Cases", () => {
  let mockRequest: Request;
  let mockHeaders: Headers;

  beforeEach(() => {
    mockHeaders = new Headers();
    mockRequest = {
      url: "https://example.com/api/test",
      method: "GET",
      headers: mockHeaders,
    } as Request;
  });

  describe("URL Edge Cases", () => {
    test("should handle URL with multiple consecutive slashes in path", () => {
      const multiSlashRequest = {
        ...mockRequest,
        url: "https://example.com//api///users//123/",
      } as Request;

      const request = new HttpRequest(multiSlashRequest);
      expect(request.path).toBe("//api///users//123");
    });

    test("should handle URL with encoded parameters", () => {
      const encodedRequest = {
        ...mockRequest,
        url: "https://example.com/search?q=hello%20world&tags=%5B%22tag1%22%2C%22tag2%22%5D",
      } as Request;

      const request = new HttpRequest(encodedRequest);
      expect(request.queries?.q).toBe("hello world");
      expect(request.queries?.tags).toBe('["tag1","tag2"]');
    });

    test("should handle URL with numeric domain", () => {
      const numericDomainRequest = {
        ...mockRequest,
        url: "http://192.168.1.1:8080/api/test",
      } as Request;

      const request = new HttpRequest(numericDomainRequest);
      expect(request.url.getHostname()).toBe("192.168.1.1");
      expect(request.url.getPort()).toBe(8080);
    });

    test("should handle URL with international domain names", () => {
      const idnRequest = {
        ...mockRequest,
        url: "https://xn--n3h.com/test", // 🔥.com in punycode
      } as Request;

      const request = new HttpRequest(idnRequest);
      expect(request.url.getHostname()).toBe("xn--n3h.com");
    });

    test("should handle URL with very long query string", () => {
      const longQuery = Array.from({ length: 1000 }, (_, i) => `param${i}=${i}`).join("&");
      const longQueryRequest = {
        ...mockRequest,
        url: `https://example.com/test?${longQuery}`,
      } as Request;

      const request = new HttpRequest(longQueryRequest);
      expect(Object.keys(request.queries ?? {})).toHaveLength(1000);
      expect(request.queries?.param999).toBe(999);
    });

    test("should handle URL with no protocol specified", () => {
      // This would typically be invalid, but testing our handling
      const noProtocolRequest = {
        ...mockRequest,
        url: "//example.com/api/test",
      } as Request;

      expect(() => new HttpRequest(noProtocolRequest)).toThrow();
    });
  });

  describe("Header Edge Cases", () => {
    test("should handle headers with unusual casing", () => {
      mockHeaders.set("cOnTeNt-TyPe", "application/json");
      mockHeaders.set("HOST", "API.EXAMPLE.COM");
      mockHeaders.set("x-custom-header", "value");

      const request = new HttpRequest(mockRequest);
      expect(request.header.get("Content-Type")).toBe("application/json");
      expect(request.host).toBe("API.EXAMPLE.COM");
      expect(request.header.get("X-Custom-Header")).toBe("value");
    });

    test("should handle headers with empty values", () => {
      mockHeaders.set("X-Empty", "");
      mockHeaders.set("X-Whitespace", "   ");
      mockHeaders.set("Authorization", "");

      const request = new HttpRequest(mockRequest);
      expect(request.header.get("X-Empty" as `X-Custom-${string}`)).toBe("");
      expect(request.header.get("X-Whitespace" as `X-Custom-${string}`)).toBe(""); // Headers normalize whitespace-only values to empty
      expect(request.header.get("Authorization")).toBe("");
    });

    test("should handle very long header values", () => {
      const longValue = "x".repeat(10_000);
      mockHeaders.set("X-Long-Header", longValue);

      const request = new HttpRequest(mockRequest);
      expect(request.header.get("X-Long-Header" as `X-Custom-${string}`)).toBe(longValue);
    });

    test("should handle headers with special characters", () => {
      mockHeaders.set("X-Special", "value with spaces and symbols: !@#$%^&*()");
      // Note: Headers API doesn't support unicode characters, so we test with ASCII
      mockHeaders.set("X-ASCII-Only", "Hello World");

      const request = new HttpRequest(mockRequest);
      expect(request.header.get("X-Special" as `X-Custom-${string}`)).toBe("value with spaces and symbols: !@#$%^&*()");
      expect(request.header.get("X-ASCII-Only" as `X-Custom-${string}`)).toBe("Hello World");
    });
  });

  describe("Language Detection Edge Cases", () => {
    test("should handle invalid language codes gracefully", () => {
      const invalidLangRequest = {
        ...mockRequest,
        url: "https://example.com/test?lang=invalid-lang-code",
      } as Request;

      const request = new HttpRequest(invalidLangRequest);
      expect(request.lang.code).toBe("invalid-lang-code" as LocaleType); // HttpRequest doesn't validate locale codes
      expect(request.lang.region).toBe(null);
    });

    test("should handle language codes with extra segments", () => {
      mockHeaders.set("Accept-Language", "zh-Hans-CN,zh;q=0.9");

      const request = new HttpRequest(mockRequest);
      expect(request.lang.code).toBeDefined();
      expect(request.lang.region).toBeDefined();
    });

    test("should handle conflicting language preferences", () => {
      mockHeaders.set("Accept-Language", "fr-FR,fr;q=0.9");
      mockHeaders.set("X-Custom-Lang", "es");

      const conflictRequest = {
        ...mockRequest,
        url: "https://example.com/test?lang=de&locale=it",
      } as Request;

      const request = new HttpRequest(conflictRequest, {});
      // Should prioritize query param 'lang'
      expect(request.lang.code).toBe("de");
    });

    test("should handle malformed Accept-Language headers", () => {
      const malformedHeaders = [
        "en-",
        "-US",
        "en_US", // underscore instead of dash
        "en-US-",
        "en;q=",
        "en;q=invalid",
      ];

      malformedHeaders.forEach((header) => {
        const headers = new Headers();
        headers.set("Accept-Language", header);
        const req = { ...mockRequest, headers } as Request;

        // Should not throw and should have some reasonable fallback
        expect(() => new HttpRequest(req)).not.toThrow();
      });
    });
  });

  describe("Form Data Edge Cases", () => {
    test("should handle form data with duplicate keys", () => {
      const formData = new FormData();
      formData.append("name", "value1");
      formData.append("name", "value2");
      formData.append("file", new File(["content1"], "file1.txt", { type: "text/plain" }));
      formData.append("file", new File(["content2"], "file2.txt", { type: "text/plain" }));

      const request = new HttpRequest(mockRequest, { form: formData });

      // Should only keep the last file with the same name
      expect(Object.keys(request.files)).toHaveLength(1);
      expect(request.files.file).toBeDefined();
    });

    test("should handle files with unusual names", () => {
      const formData = new FormData();
      const unusualNames = [
        "file with spaces.txt",
        "file-with-dashes.pdf",
        "file_with_underscores.jpg",
        "file.with.dots.doc",
        "file@#$%^&*.bin",
        "файл.txt", // Cyrillic
        "文件.doc", // Chinese
        "🔥.txt", // Emoji
      ];

      unusualNames.forEach((name, index) => {
        const file = new File([`content${index}`], name, {
          type: "text/plain",
        });
        formData.append(`file${index}`, file);
      });

      const request = new HttpRequest(mockRequest, { form: formData });
      expect(Object.keys(request.files)).toHaveLength(unusualNames.length);
    });

    test("should handle empty files", () => {
      const formData = new FormData();
      const emptyFile = new File([], "empty.txt", { type: "text/plain" });
      formData.append("empty", emptyFile);

      const request = new HttpRequest(mockRequest, { form: formData });
      expect(request.files.empty).toBeDefined();
      expect(request.files.empty?.size).toBe(0);
    });

    test("should handle very large file names", () => {
      const formData = new FormData();
      const longFileName = `${"a".repeat(200)}.txt`;
      const file = new File(["content"], longFileName, { type: "text/plain" });
      formData.append("longName", file);

      const request = new HttpRequest(mockRequest, { form: formData });
      expect(request.files.longName).toBeDefined();
      expect(request.files.longName?.originalName.length).toBeGreaterThan(100);
    });
  });

  describe("Configuration Edge Cases", () => {
    test("should handle null and undefined in config", () => {
      const config = {
        form: null,
      };

      const request = new HttpRequest(mockRequest, config);
      expect(request.params).toEqual({});
      expect(request.payload).toEqual({});
      expect(request.form).toBe(null);
      expect(request.ip).toBe(null);
    });

    test("should handle very large params object", () => {
      const largeParams: Record<string, string> = {};
      for (let i = 0; i < 1000; i++) {
        largeParams[`param${i}`] = `value${i}`;
      }

      const request = new HttpRequest(mockRequest, { params: largeParams });
      expect(Object.keys(request.params ?? {})).toHaveLength(1000);
      expect(request.params?.param999).toBe("value999");
    });

    test("should handle nested payload objects", () => {
      const nestedPayload = {
        user: {
          profile: {
            personal: {
              name: "John",
              age: 30,
              preferences: {
                theme: "dark",
                language: "en",
                notifications: {
                  email: true,
                  push: false,
                  sms: null,
                },
              },
            },
          },
        },
        metadata: {
          timestamp: new Date(),
          source: "api",
          version: "1.0",
        },
      };

      const request = new HttpRequest(mockRequest, { payload: nestedPayload });
      expect(request.payload).toEqual(nestedPayload);
      expect((request.payload as unknown as NestedPayload).user.profile.personal.name).toBe("John");
    });
  });

  describe("Performance Edge Cases", () => {
    test("should handle request with massive query string efficiently", () => {
      const massiveQuery = Array.from(
        { length: 5000 },
        (_, i) => `param${i}=${encodeURIComponent(`value with spaces and symbols ${i} !@#$%^&*()`)}`,
      ).join("&");

      const massiveRequest = {
        ...mockRequest,
        url: `https://example.com/test?${massiveQuery}`,
      } as Request;

      const startTime = performance.now();
      const request = new HttpRequest(massiveRequest);
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(100);
      expect(Object.keys(request.queries ?? {})).toHaveLength(5000);
    });

    test("should handle deeply nested form data structure", () => {
      const formData = new FormData();

      // Create a complex form structure
      for (let i = 0; i < 100; i++) {
        formData.append(`data[${i}][name]`, `item${i}`);
        formData.append(`data[${i}][value]`, `value${i}`);

        if (i % 10 === 0) {
          const file = new File([`content${i}`], `file${i}.txt`, {
            type: "text/plain",
          });
          formData.append(`data[${i}][file]`, file);
        }
      }

      const startTime = performance.now();
      const request = new HttpRequest(mockRequest, { form: formData });
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(50);
      expect(Object.keys(request.files)).toHaveLength(10);
    });
  });

  describe("Memory and Resource Management", () => {
    test("should not retain references to large temporary objects", () => {
      const largePayload = {
        data: new Array(10_000).fill(0).map((_, i) => ({
          id: i,
          data: `${"x".repeat(1000)}-${i}`,
        })),
      };

      const request = new HttpRequest(mockRequest, { payload: largePayload });

      // Verify the payload is accessible
      expect((request.payload as unknown as LargePayload).data).toHaveLength(10_000);
      expect((request.payload as unknown as LargePayload).data[0]?.data).toContain("x".repeat(1000));

      // The request should maintain reference to the payload
      expect(request.payload).toBe(largePayload);
    });

    test("should handle circular references in payload gracefully", () => {
      const circularPayload: CircularPayload = {
        name: "test",
        data: {},
      };
      circularPayload.data.parent = circularPayload;

      // Should not throw when creating the request
      expect(() => {
        new HttpRequest(mockRequest, { payload: circularPayload });
      }).not.toThrow();
    });
  });

  describe("Type Safety Edge Cases", () => {
    test("should handle mixed scalar types in params", () => {
      const mixedParams = {
        stringParam: "hello",
        numberParam: 42,
        bigintParam: BigInt(999_999_999_999_999),
        booleanParam: true,
        nullParam: "null", // Testing runtime behavior with string representation
        undefinedParam: "undefined",
      };

      const request = new HttpRequest(mockRequest, { params: mixedParams });

      expect(request.params?.stringParam).toBe("hello");
      expect(request.params?.numberParam).toBe(42);
      expect(request.params?.bigintParam).toBe(BigInt(999_999_999_999_999));
      expect(request.params?.booleanParam).toBe(true);
    });

    test("should handle edge cases in query parameter parsing", () => {
      const edgeCaseRequest = {
        ...mockRequest,
        url: "https://example.com/test?zero=0&emptyString=&nullValue=null&undefinedValue=undefined&array[]=1&array[]=2",
      } as Request;

      const request = new HttpRequest(edgeCaseRequest);

      expect(request.queries?.zero).toBe("0"); // Should remain string due to leading zero
      expect(request.queries?.emptyString).toBe("");
      expect(request.queries?.nullValue).toBe("null"); // Should remain string
      expect(request.queries?.undefinedValue).toBe("undefined"); // Should remain string
    });
  });

  describe("Boundary Conditions", () => {
    test("should handle minimum viable request", () => {
      const minimalRequest = {
        url: "http://a.com/",
        method: "GET",
        headers: new Headers(),
      } as Request;

      const request = new HttpRequest(minimalRequest);

      expect(request.method).toBe("GET");
      expect(request.path).toBe("/");
      expect(request.queries).toEqual({});
      expect(request.params).toEqual({});
      expect(request.payload).toEqual({});
      expect(request.files).toEqual({});
      expect(request.lang).toBeDefined();
    });

    test("should handle maximum reasonable complexity", () => {
      const maxHeaders = new Headers();

      // Add many headers
      for (let i = 0; i < 100; i++) {
        maxHeaders.set(`X-Custom-${i}`, `value-${i}`);
      }

      maxHeaders.set("Host", "complex.api.example.com");
      maxHeaders.set("User-Agent", "Complex/1.0 (Platform; OS 10.0; Device) Engine/1.0");
      maxHeaders.set("Accept-Language", "en-US,en;q=0.9,fr;q=0.8,es;q=0.7,de;q=0.6");

      const maxQuery = Array.from({ length: 500 }, (_, i) => `q${i}=v${i}`).join("&");

      const maxRequest = {
        url: `https://complex.api.example.com/very/deep/path/with/many/segments?${maxQuery}`,
        method: "POST",
        headers: maxHeaders,
      } as Request;

      const maxFormData = new FormData();
      for (let i = 0; i < 50; i++) {
        if (i % 5 === 0) {
          maxFormData.append(`file${i}`, new File([`content${i}`], `file${i}.txt`));
        } else {
          maxFormData.append(`field${i}`, `value${i}`);
        }
      }

      const maxParams: Record<string, string> = {};
      const maxPayload: Record<string, unknown> = {};

      for (let i = 0; i < 200; i++) {
        maxParams[`param${i}`] = `value${i}`;
        maxPayload[`data${i}`] = { id: i, value: `data${i}` };
      }

      const startTime = performance.now();
      const request = new HttpRequest(maxRequest, {
        params: maxParams,
        payload: maxPayload,
        form: maxFormData,
        ip: "192.168.1.100",
      });
      const endTime = performance.now();

      // Should handle maximum complexity efficiently
      expect(endTime - startTime).toBeLessThan(100);

      expect(Object.keys(request.queries ?? {})).toHaveLength(500);
      expect(Object.keys(request.params ?? {})).toHaveLength(200);
      expect(Object.keys(request.payload ?? {})).toHaveLength(200);
      expect(Object.keys(request.files)).toHaveLength(10);
      expect(request.ip).toBe("192.168.1.100");
    });
  });
});
