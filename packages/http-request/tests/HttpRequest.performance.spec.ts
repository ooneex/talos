import { beforeEach, describe, expect, test } from "bun:test";
import { HttpRequest } from "@/HttpRequest";

describe("HttpRequest Performance Tests", () => {
  let baseRequest: Request;
  let baseHeaders: Headers;

  beforeEach(() => {
    baseHeaders = new Headers();
    baseRequest = {
      url: "https://example.com/api/test",
      method: "GET",
      headers: baseHeaders,
    } as Request;
  });

  describe("Instantiation Performance", () => {
    test("should create instances quickly for simple requests", () => {
      const iterations = 1000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        new HttpRequest(baseRequest);
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / iterations;

      // Should average less than 1ms per instance
      expect(avgTime).toBeLessThan(1);
    });

    test("should handle complex requests efficiently", () => {
      const complexHeaders = new Headers();
      complexHeaders.set("Host", "api.example.com");
      complexHeaders.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
      complexHeaders.set("Accept-Language", "en-US,en;q=0.9,fr;q=0.8,es;q=0.7");
      complexHeaders.set("Cookie", "session=abc123; user=john; theme=dark; prefs=compact");
      complexHeaders.set("Authorization", "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");

      const complexRequest = {
        url: "https://api.example.com/v2/users/profile?include=posts,comments&sort=created_at&filter=active&page=1&limit=50",
        method: "POST",
        headers: complexHeaders,
      } as Request;

      const iterations = 100;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        new HttpRequest(complexRequest);
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / iterations;

      // Should still be reasonably fast even with complex data
      expect(avgTime).toBeLessThan(5);
    });
  });

  describe("Large Form Data Performance", () => {
    test("should handle many form fields efficiently", () => {
      const formData = new FormData();

      // Add 100 form fields
      for (let i = 0; i < 100; i++) {
        formData.append(`field${i}`, `value${i}`);
      }

      const startTime = performance.now();
      const request = new HttpRequest(baseRequest, { form: formData });
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(50);
      expect(request.form).toBe(formData);
    });

    test("should handle multiple files efficiently", () => {
      const formData = new FormData();

      // Add 20 files of varying sizes
      for (let i = 0; i < 20; i++) {
        const size = Math.floor(Math.random() * 1000) + 100; // 100-1100 bytes
        const content = new Array(size).fill("x").join("");
        const file = new File([content], `file${i}.txt`, {
          type: "text/plain",
        });
        formData.append(`file${i}`, file);
      }

      const startTime = performance.now();
      const request = new HttpRequest(baseRequest, { form: formData });
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(100);
      expect(Object.keys(request.files)).toHaveLength(20);
    });

    test("should handle mixed form data efficiently", () => {
      const formData = new FormData();

      // Mix of files and regular fields
      for (let i = 0; i < 25; i++) {
        if (i % 2 === 0) {
          // Add file
          const file = new File([`content${i}`], `doc${i}.txt`, {
            type: "text/plain",
          });
          formData.append(`file${i}`, file);
        } else {
          // Add regular field
          formData.append(`field${i}`, `value${i}`);
        }
      }

      const startTime = performance.now();
      const request = new HttpRequest(baseRequest, { form: formData });
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(75);
      expect(Object.keys(request.files)).toHaveLength(13); // 25/2 rounded up
    });
  });

  describe("URL Processing Performance", () => {
    test("should handle URLs with many query parameters efficiently", () => {
      const queryParams = Array.from({ length: 100 }, (_, i) => `param${i}=value${i}`).join("&");
      const urlWithManyParams = `https://example.com/api/search?${queryParams}`;

      const requestWithManyParams = {
        ...baseRequest,
        url: urlWithManyParams,
      } as Request;

      const startTime = performance.now();
      const request = new HttpRequest(requestWithManyParams);
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(25);
      expect(Object.keys(request.queries ?? {})).toHaveLength(100);
    });

    test("should handle deeply nested paths efficiently", () => {
      const deepPath = Array.from({ length: 20 }, (_, i) => `level${i}`).join("/");
      const deepUrl = `https://example.com/${deepPath}`;

      const deepRequest = {
        ...baseRequest,
        url: deepUrl,
      } as Request;

      const startTime = performance.now();
      const request = new HttpRequest(deepRequest);
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(10);
      expect(request.path).toBe(`/${deepPath}`);
    });
  });

  describe("Header Processing Performance", () => {
    test("should handle many headers efficiently", () => {
      const manyHeaders = new Headers();

      // Add 50 headers
      for (let i = 0; i < 50; i++) {
        manyHeaders.set(`X-Custom-Header-${i}`, `value${i}`);
      }

      // Add common headers
      manyHeaders.set("Host", "api.example.com");
      manyHeaders.set("User-Agent", "Test Agent");
      manyHeaders.set("Accept-Language", "en-US,en;q=0.9");

      const requestWithManyHeaders = {
        ...baseRequest,
        headers: manyHeaders,
      } as Request;

      const startTime = performance.now();
      const request = new HttpRequest(requestWithManyHeaders);
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(20);
      expect(request.header.get("X-Custom-Header-25")).toBe("value25");
    });

    test("should handle complex Accept-Language headers efficiently", () => {
      const complexLanguages = [
        "fr-CH",
        "fr;q=0.9",
        "en;q=0.8",
        "de;q=0.7",
        "it;q=0.6",
        "es;q=0.5",
        "pt;q=0.4",
        "ru;q=0.3",
        "ja;q=0.2",
        "*;q=0.1",
      ].join(", ");

      baseHeaders.set("Accept-Language", complexLanguages);

      const iterations = 500;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        new HttpRequest(baseRequest);
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / iterations;

      expect(avgTime).toBeLessThan(2);
    });
  });

  describe("Memory Usage Performance", () => {
    test("should not leak memory with repeated instantiation", () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const iterations = 1000;

      // Create and discard many instances
      for (let i = 0; i < iterations; i++) {
        const request = new HttpRequest(baseRequest, {
          params: { id: i.toString() },
          payload: { data: `test${i}` },
        });

        // Access properties to ensure they're initialized
        request.path;
        request.queries;
        request.lang;
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 10MB for 1000 instances)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });

    test("should handle large payload data efficiently", () => {
      const largePayload = {
        data: new Array(10_000).fill(0).map((_, i) => ({
          id: i,
          name: `item${i}`,
          description: `Description for item ${i}`,
          tags: [`tag${i}`, `category${i % 10}`, `type${i % 5}`],
        })),
      };

      const startTime = performance.now();
      const request = new HttpRequest(baseRequest, { payload: largePayload });
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(50);
      expect(request.payload).toBe(largePayload);
    });
  });

  describe("Concurrent Access Performance", () => {
    test("should handle concurrent instantiation efficiently", async () => {
      const concurrentRequests = 50;
      const startTime = performance.now();

      const promises = Array.from({ length: concurrentRequests }, async (_, i) => {
        const requestUrl = `https://example${i}.com/api/test${i}?param=${i}`;
        const req = { ...baseRequest, url: requestUrl } as Request;

        return new Promise<HttpRequest>((resolve) => {
          setTimeout(() => {
            const request = new HttpRequest(req, {
              params: { id: i.toString() },
              payload: { index: i },
            });
            resolve(request);
          }, Math.random() * 10); // Random delay 0-10ms
        });
      });

      const results = await Promise.all(promises);
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(200);
      expect(results).toHaveLength(concurrentRequests);

      // Verify each request was processed correctly
      results.forEach((request, index) => {
        expect(request.params?.id).toBe(index.toString());
        expect(request.payload?.index).toBe(index);
      });
    });
  });

  describe("Real-world Scenario Performance", () => {
    test("should handle typical API request efficiently", () => {
      const apiHeaders = new Headers();
      apiHeaders.set("Host", "api.myapp.com");
      apiHeaders.set("User-Agent", "MyApp/1.0 (iOS; iPhone 12 Pro)");
      apiHeaders.set("Accept", "application/json");
      apiHeaders.set("Accept-Language", "en-US,en;q=0.9");
      apiHeaders.set("Authorization", "Bearer jwt.token.here");
      apiHeaders.set("Content-Type", "application/json");
      apiHeaders.set("X-Client-Version", "2.1.0");
      apiHeaders.set("X-Device-ID", "device123");

      const apiRequest = {
        url: "https://api.myapp.com/v1/users/profile?include=preferences,settings&v=2.1",
        method: "PUT",
        headers: apiHeaders,
      } as Request;

      const formData = new FormData();
      formData.append(
        "profile",
        JSON.stringify({
          firstName: "John",
          lastName: "Doe",
          email: "john.doe@example.com",
        }),
      );
      formData.append("avatar", new File(["image data"], "avatar.jpg", { type: "image/jpeg" }));

      const iterations = 100;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        const request = new HttpRequest(apiRequest, {
          params: { userId: "user123" },
          payload: { action: "update_profile", timestamp: Date.now() },
          form: formData,
          ip: "192.168.1.100",
        });

        // Simulate accessing common properties
        request.method;
        request.path;
        request.host;
        request.lang;
        request.userAgent;
        Object.keys(request.files).length;
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / iterations;

      // Should handle realistic API requests quickly
      expect(avgTime).toBeLessThan(3);
    });

    test("should handle file upload scenario efficiently", () => {
      const uploadHeaders = new Headers();
      uploadHeaders.set("Host", "upload.myapp.com");
      uploadHeaders.set("Content-Type", "multipart/form-data");
      uploadHeaders.set("Authorization", "Bearer upload.token");

      const uploadRequest = {
        url: "https://upload.myapp.com/api/files/upload?folder=documents&compress=true",
        method: "POST",
        headers: uploadHeaders,
      } as Request;

      // Simulate multiple file upload
      const formData = new FormData();
      const files = [
        { name: "document1.pdf", size: 2048, type: "application/pdf" },
        { name: "image1.jpg", size: 1024, type: "image/jpeg" },
        {
          name: "spreadsheet.xlsx",
          size: 4096,
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        { name: "text.txt", size: 512, type: "text/plain" },
      ];

      files.forEach((fileInfo, index) => {
        const content = new Array(fileInfo.size).fill("x").join("");
        const file = new File([content], fileInfo.name, {
          type: fileInfo.type,
        });
        formData.append(`file${index}`, file);
      });

      formData.append(
        "metadata",
        JSON.stringify({
          uploadedBy: "user123",
          category: "documents",
          tags: ["work", "important"],
        }),
      );

      const startTime = performance.now();
      const request = new HttpRequest(uploadRequest, {
        form: formData,
        params: { uploadId: "upload789" },
        ip: "10.0.0.50",
      });
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(25);
      expect(Object.keys(request.files)).toHaveLength(4);
      expect(request.files.file0).toBeDefined();
      expect(request.files.file1).toBeDefined();
      expect(request.files.file2).toBeDefined();
      expect(request.files.file3).toBeDefined();
    });
  });
});
