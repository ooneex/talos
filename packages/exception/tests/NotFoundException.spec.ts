import { describe, expect, test } from "bun:test";
import { HttpStatus } from "@talosjs/http-status";
import { Exception } from "@/Exception";
import { NotFoundException } from "@/NotFoundException";

describe("NotFoundException", () => {
  describe("Name", () => {
    test("should have correct exception name", () => {
      const exception = new NotFoundException("Test message", "TEST");

      expect(exception.name).toBe("NotFoundException");
    });
  });

  describe("Immutable Data", () => {
    test("should have immutable data property", () => {
      const data = { key: "value", count: 42 };
      const exception = new NotFoundException("Test message", "TEST", data);

      expect(Object.isFrozen(exception.data)).toBe(true);
      expect(() => {
        exception.data.key = "modified";
      }).toThrow();
    });
  });

  describe("Constructor", () => {
    test("should create NotFoundException with message only", () => {
      const message = "Resource not found";
      const exception = new NotFoundException(message, "TEST");

      expect(exception).toBeInstanceOf(NotFoundException);
      expect(exception).toBeInstanceOf(Exception);
      expect(exception).toBeInstanceOf(Error);
      expect(exception.message).toBe(message);
      expect(exception.key).toBe("TEST");
      expect(exception.status).toBe(HttpStatus.Code.NotFound);
      expect(exception.data).toEqual({});
    });

    test("should create NotFoundException with message and data", () => {
      const message = "User not found";
      const data = { id: "user-123", resource: "users" };
      const exception = new NotFoundException(message, "TEST", data);

      expect(exception.message).toBe(message);
      expect(exception.key).toBe("TEST");
      expect(exception.status).toBe(HttpStatus.Code.NotFound);
      expect(exception.data).toEqual(data);
    });

    test("should create NotFoundException with empty data object", () => {
      const message = "Empty data test";
      const data = {};
      const exception = new NotFoundException(message, "TEST", data);

      expect(exception.message).toBe(message);
      expect(exception.status).toBe(HttpStatus.Code.NotFound);
      expect(exception.data).toEqual(data);
    });

    test("should handle null data gracefully", () => {
      const message = "Null data test";
      const exception = new NotFoundException(message, "TEST");

      expect(exception.message).toBe(message);
      expect(exception.status).toBe(HttpStatus.Code.NotFound);
      expect(exception.data).toEqual({});
    });
  });

  describe("Inheritance and Properties", () => {
    test("should inherit all properties from Exception", () => {
      const message = "Resource not found error";
      const data = { resourceId: "item-123", resourceType: "product" };
      const exception = new NotFoundException(message, "TEST", data);

      // Properties from Exception
      expect(exception.key).toBe("TEST");
      expect(exception.date).toBeInstanceOf(Date);
      expect(exception.status).toBe(HttpStatus.Code.NotFound);
      expect(exception.data).toEqual(data);
      expect(exception.native).toBeUndefined();

      // Properties from Error
      expect(exception.name).toBe("NotFoundException");
      expect(exception.message).toBe(message);
      expect(exception.stack).toBeDefined();
    });

    test("should always set status to NotFound", () => {
      const exception1 = new NotFoundException("Error 1", "TEST");
      const exception2 = new NotFoundException("Error 2", "TEST", { key: "value" });

      expect(exception1.status).toBe(HttpStatus.Code.NotFound);
      expect(exception2.status).toBe(HttpStatus.Code.NotFound);
      expect(exception1.status).toBe(404);
      expect(exception2.status).toBe(404);
    });

    test("should have readonly data property", () => {
      const data = { resourceId: "test-123" };
      const exception = new NotFoundException("Test", "TEST", data);

      expect(exception.data).toEqual(data);
      expect(Object.isFrozen(exception.data)).toBe(true);
    });
  });

  describe("Generic Type Support", () => {
    test("should support generic type for data values", () => {
      interface ResourceError {
        id: string;
        type: string;
        lastSeen: string;
      }

      const errorData: Record<string, ResourceError> = {
        userError: {
          id: "user-456",
          type: "user",
          lastSeen: "2024-01-15T10:30:00Z",
        },
        documentError: {
          id: "doc-789",
          type: "document",
          lastSeen: "2024-01-14T15:45:00Z",
        },
      };

      const exception = new NotFoundException("Resource not found", "TEST", errorData);

      expect(exception.data).toEqual(errorData);
      expect((exception.data?.userError as ResourceError)?.id).toBe("user-456");
      expect((exception.data?.userError as ResourceError)?.type).toBe("user");
      expect((exception.data?.documentError as ResourceError)?.type).toBe("document");
    });

    test("should support string generic type", () => {
      const stringData: Record<string, string> = {
        path: "/api/users/missing",
        suggestion: "Check if the resource ID is correct",
        endpoint: "/api/users",
      };

      const exception = new NotFoundException("String data test", "TEST", stringData);

      expect(exception.data).toEqual(stringData);
      expect(typeof exception.data?.path).toBe("string");
    });

    test("should support number generic type", () => {
      const numberData: Record<string, number> = {
        userId: 404,
        attempts: 3,
        lastFoundTimestamp: 1_640_995_200,
      };

      const exception = new NotFoundException("Number data test", "TEST", numberData);

      expect(exception.data).toEqual(numberData);
      expect(typeof exception.data?.userId).toBe("number");
    });
  });

  describe("Error Handling Scenarios", () => {
    test("should handle resource lookup failures", () => {
      const exception = new NotFoundException("Resource lookup failed", "TEST", {
        resourceId: "product-789",
        resourceType: "product",
        searchCriteria: "sku",
        searchValue: "ABC-123",
        database: "inventory",
      });

      expect(exception.message).toBe("Resource lookup failed");
      expect(exception.data?.resourceId).toBe("product-789");
      expect(exception.data?.searchCriteria).toBe("sku");
    });

    test("should handle API endpoint not found", () => {
      const exception = new NotFoundException("API endpoint not found", "TEST", {
        path: "/api/v2/deprecated-endpoint",
        method: "GET",
        availableEndpoints: ["/api/v3/users", "/api/v3/products"],
        suggestion: "Use v3 API instead",
      });

      expect(exception.message).toBe("API endpoint not found");
      expect(exception.data?.path).toBe("/api/v2/deprecated-endpoint");
      expect(exception.data?.availableEndpoints).toHaveLength(2);
    });

    test("should handle file system resource not found", () => {
      const exception = new NotFoundException("File not found", "TEST", {
        filePath: "/uploads/documents/report.pdf",
        fileType: "pdf",
        directory: "/uploads/documents",
        permissions: "read",
        fileSize: null,
      });

      expect(exception.message).toBe("File not found");
      expect(exception.data?.filePath).toBe("/uploads/documents/report.pdf");
      expect(exception.data?.fileSize).toBeNull();
    });

    test("should handle database record not found", () => {
      const exception = new NotFoundException("Database record not found", "TEST", {
        table: "orders",
        primaryKey: "id",
        value: 99_999,
        query: "SELECT * FROM orders WHERE id = ?",
        database: "ecommerce",
      });

      expect(exception.message).toBe("Database record not found");
      expect(exception.data?.table).toBe("orders");
      expect(exception.data?.value).toBe(99_999);
    });
  });

  describe("Stack Trace and Debugging", () => {
    test("should maintain proper stack trace", () => {
      function throwNotFoundException() {
        throw new NotFoundException("Stack trace test", "TEST");
      }

      try {
        throwNotFoundException();
        // biome-ignore lint/suspicious/noExplicitAny: trust me
      } catch (error: any) {
        expect(error).toBeInstanceOf(NotFoundException);
        expect(error.stack).toBeDefined();
        expect(error.stack).toContain("throwNotFoundException");
        expect(error.stack).toContain("Stack trace test");
      }
    });

    test("should support stackToJson method from parent Exception", () => {
      const exception = new NotFoundException("JSON stack test", "TEST");
      const stackJson = exception.stackToJson();

      expect(stackJson).toBeDefined();
      if (stackJson) {
        expect(Array.isArray(stackJson)).toBe(true);
        expect(stackJson.length).toBeGreaterThan(0);
        expect(stackJson[0]).toHaveProperty("source");
      }
    });
  });

  describe("Serialization and Inspection", () => {
    test("should be JSON serializable", () => {
      const exception = new NotFoundException("Serialization test", "TEST", {
        component: "resource-finder",
        version: "4.2.0",
        cacheEnabled: false,
      });

      const serialized = JSON.stringify({
        message: exception.message,
        name: exception.name,
        status: exception.status,
        data: exception.data,
        date: exception.date,
      });
      const parsed = JSON.parse(serialized);

      expect(parsed.message).toBe("Serialization test");
      expect(parsed.name).toBe("NotFoundException");
      expect(parsed.status).toBe(404);
      expect(parsed.data).toEqual({
        component: "resource-finder",
        version: "4.2.0",
        cacheEnabled: false,
      });
    });

    test("should have correct toString representation", () => {
      const exception = new NotFoundException("ToString test", "TEST");
      const stringRep = exception.toString();

      expect(stringRep).toContain("NotFoundException");
      expect(stringRep).toContain("ToString test");
    });
  });

  describe("Edge Cases", () => {
    test("should handle empty message", () => {
      const exception = new NotFoundException("", "TEST");

      expect(exception.message).toBe("");
      expect(exception.status).toBe(HttpStatus.Code.NotFound);
    });

    test("should handle very long messages", () => {
      const longMessage = "x".repeat(1000);
      const exception = new NotFoundException(longMessage, "TEST");

      expect(exception.message).toBe(longMessage);
      expect(exception.message.length).toBe(1000);
    });

    test("should handle special characters in message", () => {
      const specialMessage = "Resource Not Found: 特殊文字 🔍 with émojis and ñumbers 123!@#$%^&*()";
      const exception = new NotFoundException(specialMessage, "TEST");

      expect(exception.message).toBe(specialMessage);
    });

    test("should handle complex nested data", () => {
      const complexData = {
        search: {
          query: "missing-item",
          filters: ["active", "published"],
          results: 0,
        },
        context: {
          userId: "user-789",
          sessionId: "sess-abc123",
          timestamp: new Date().toISOString(),
        },
        metadata: {
          searchEngine: "elasticsearch",
          indexName: "products",
          totalIndexed: 50_000,
        },
        suggestions: {
          similarTerms: ["missing", "unavailable", "deleted"],
          alternativeActions: ["Contact support", "Try different search"],
        },
      };

      const exception = new NotFoundException("Complex data test", "TEST", complexData);

      expect(exception.data).toEqual(complexData);
      expect((exception.data?.search as { results: number })?.results).toBe(0);
      expect((exception.data?.search as { filters: string[] })?.filters).toHaveLength(2);
      expect((exception.data?.metadata as { totalIndexed: number })?.totalIndexed).toBe(50_000);
      expect((exception.data?.suggestions as { similarTerms: string[] })?.similarTerms).toContain("missing");
    });

    test("should handle resource-specific data structures", () => {
      interface ResourceSearchResult {
        resourceId: string;
        resourceType: "user" | "product" | "order" | "document";
        searchAttempts: {
          method: string;
          timestamp: string;
          found: boolean;
        }[];
        lastKnownLocation?: string;
        relatedResources: string[];
      }

      const resourceData: ResourceSearchResult = {
        resourceId: "order-404",
        resourceType: "order",
        searchAttempts: [
          {
            method: "database_primary_key",
            timestamp: new Date().toISOString(),
            found: false,
          },
          {
            method: "index_search",
            timestamp: new Date().toISOString(),
            found: false,
          },
        ],
        lastKnownLocation: "/api/orders/404",
        relatedResources: ["user-123", "product-456"],
      };

      const exception = new NotFoundException(
        "Resource search failed",
        "TEST",
        resourceData as unknown as Record<string, unknown>,
      );

      expect(exception.data?.resourceId).toBe("order-404");
      expect(exception.data?.resourceType).toBe("order");
      expect(exception.data?.searchAttempts).toHaveLength(2);
      expect(exception.data?.relatedResources).toContain("user-123");
    });
  });

  describe("Resource-Specific Scenarios", () => {
    test("should handle user account lookup failures", () => {
      const exception = new NotFoundException("User account not found", "TEST", {
        lookupMethod: "email",
        emailAddress: "nonexistent@example.com",
        searchedTables: ["users", "user_profiles", "archived_users"],
        accountStatus: null,
        registrationDate: null,
        lastLoginDate: null,
      });

      expect(exception.message).toBe("User account not found");
      expect(exception.data?.lookupMethod).toBe("email");
      expect(exception.data?.searchedTables).toHaveLength(3);
      expect(exception.data?.accountStatus).toBeNull();
    });

    test("should handle inventory item not found", () => {
      const exception = new NotFoundException("Inventory item not found", "TEST", {
        sku: "PROD-404-XYZ",
        category: "electronics",
        warehouse: "main",
        lastStockCount: 0,
        discontinuedDate: "2024-01-01",
        replacementProducts: ["PROD-405-XYZ", "PROD-406-XYZ"],
      });

      expect(exception.message).toBe("Inventory item not found");
      expect(exception.data?.sku).toBe("PROD-404-XYZ");
      expect(exception.data?.lastStockCount).toBe(0);
      expect(exception.data?.replacementProducts).toHaveLength(2);
    });

    test("should handle document retrieval failures", () => {
      const exception = new NotFoundException("Document not accessible", "TEST", {
        documentId: "DOC-MISSING-001",
        documentType: "contract",
        storage: "cloud",
        encryptionStatus: "encrypted",
        permissions: {
          read: false,
          write: false,
          delete: false,
        },
        archiveStatus: "unknown",
      });

      expect(exception.message).toBe("Document not accessible");
      expect(exception.data?.documentId).toBe("DOC-MISSING-001");
      expect((exception.data?.permissions as { read: boolean })?.read).toBe(false);
      expect(exception.data?.archiveStatus).toBe("unknown");
    });

    test("should handle search result pagination", () => {
      const exception = new NotFoundException("Page not found in search results", "TEST", {
        searchTerm: "javascript tutorials",
        requestedPage: 50,
        totalPages: 25,
        resultsPerPage: 20,
        totalResults: 500,
        availablePages: Array.from({ length: 25 }, (_, i) => i + 1),
      });

      expect(exception.message).toBe("Page not found in search results");
      expect(exception.data?.requestedPage).toBe(50);
      expect(exception.data?.totalPages).toBe(25);
      expect(exception.data?.availablePages).toHaveLength(25);
    });
  });
});
