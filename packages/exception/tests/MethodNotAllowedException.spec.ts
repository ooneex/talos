import { describe, expect, test } from "bun:test";
import { HttpStatus } from "@talosjs/http-status";
import { Exception } from "@/Exception";
import { MethodNotAllowedException } from "@/MethodNotAllowedException";

describe("MethodNotAllowedException", () => {
  describe("Name", () => {
    test("should have correct exception name", () => {
      const exception = new MethodNotAllowedException("Test message", "TEST");

      expect(exception.name).toBe("MethodNotAllowedException");
    });
  });

  describe("Immutable Data", () => {
    test("should have immutable data property", () => {
      const data = { key: "value", count: 42 };
      const exception = new MethodNotAllowedException("Test message", "TEST", data);

      expect(Object.isFrozen(exception.data)).toBe(true);
      expect(() => {
        exception.data.key = "modified";
      }).toThrow();
    });
  });

  describe("Constructor", () => {
    test("should create MethodNotAllowedException with message only", () => {
      const message = "Method POST not allowed";
      const exception = new MethodNotAllowedException(message, "TEST");

      expect(exception).toBeInstanceOf(MethodNotAllowedException);
      expect(exception).toBeInstanceOf(Exception);
      expect(exception).toBeInstanceOf(Error);
      expect(exception.message).toBe(message);
      expect(exception.key).toBe("TEST");
      expect(exception.status).toBe(HttpStatus.Code.MethodNotAllowed);
      expect(exception.data).toEqual({});
    });

    test("should create MethodNotAllowedException with message and data", () => {
      const message = "HTTP method not supported";
      const data = { method: "DELETE", allowedMethods: "GET, POST, PUT" };
      const exception = new MethodNotAllowedException(message, "TEST", data);

      expect(exception.message).toBe(message);
      expect(exception.key).toBe("TEST");
      expect(exception.status).toBe(HttpStatus.Code.MethodNotAllowed);
      expect(exception.data).toEqual(data);
    });

    test("should create MethodNotAllowedException with empty data object", () => {
      const message = "Empty data test";
      const data = {};
      const exception = new MethodNotAllowedException(message, "TEST", data);

      expect(exception.message).toBe(message);
      expect(exception.status).toBe(HttpStatus.Code.MethodNotAllowed);
      expect(exception.data).toEqual(data);
    });

    test("should handle null data gracefully", () => {
      const message = "Null data test";
      const exception = new MethodNotAllowedException(message, "TEST");

      expect(exception.message).toBe(message);
      expect(exception.status).toBe(HttpStatus.Code.MethodNotAllowed);
      expect(exception.data).toEqual({});
    });
  });

  describe("Inheritance and Properties", () => {
    test("should inherit all properties from Exception", () => {
      const message = "Method not allowed error";
      const data = { method: "PATCH", endpoint: "/api/users" };
      const exception = new MethodNotAllowedException(message, "TEST", data);

      // Properties from Exception
      expect(exception.key).toBe("TEST");
      expect(exception.date).toBeInstanceOf(Date);
      expect(exception.status).toBe(HttpStatus.Code.MethodNotAllowed);
      expect(exception.data).toEqual(data);
      expect(exception.native).toBeUndefined();

      // Properties from Error
      expect(exception.name).toBe("MethodNotAllowedException");
      expect(exception.message).toBe(message);
      expect(exception.stack).toBeDefined();
    });

    test("should always set status to MethodNotAllowed", () => {
      const exception1 = new MethodNotAllowedException("Error 1", "TEST");
      const exception2 = new MethodNotAllowedException("Error 2", "TEST", {
        key: "value",
      });

      expect(exception1.status).toBe(HttpStatus.Code.MethodNotAllowed);
      expect(exception2.status).toBe(HttpStatus.Code.MethodNotAllowed);
      expect(exception1.status).toBe(405);
      expect(exception2.status).toBe(405);
    });

    test("should have readonly data property", () => {
      const data = { method: "DELETE" };
      const exception = new MethodNotAllowedException("Test", "TEST", data);

      expect(exception.data).toEqual(data);
      expect(Object.isFrozen(exception.data)).toBe(true);
    });
  });

  describe("Generic Type Support", () => {
    test("should support generic type for data values", () => {
      interface MethodError {
        method: string;
        allowedMethods: string[];
        reason: string;
      }

      const errorData: Record<string, MethodError> = {
        deleteError: {
          method: "DELETE",
          allowedMethods: ["GET", "POST", "PUT"],
          reason: "Resource is read-only",
        },
        patchError: {
          method: "PATCH",
          allowedMethods: ["GET", "POST"],
          reason: "Partial updates not supported",
        },
      };

      const exception = new MethodNotAllowedException("Method not supported", "TEST", errorData);

      expect(exception.data).toEqual(errorData);
      expect((exception.data?.deleteError as MethodError)?.method).toBe("DELETE");
      expect((exception.data?.patchError as MethodError)?.reason).toBe("Partial updates not supported");
    });

    test("should support string generic type", () => {
      const stringData: Record<string, string> = {
        method: "OPTIONS",
        suggestion: "Use GET or POST instead",
        endpoint: "/api/users",
      };

      const exception = new MethodNotAllowedException("String data test", "TEST", stringData);

      expect(exception.data).toEqual(stringData);
      expect(typeof exception.data?.method).toBe("string");
    });

    test("should support number generic type", () => {
      const numberData: Record<string, number> = {
        statusCode: 405,
        retryAfter: 3600,
        allowedMethodsCount: 3,
      };

      const exception = new MethodNotAllowedException("Number data test", "TEST", numberData);

      expect(exception.data).toEqual(numberData);
      expect(typeof exception.data?.statusCode).toBe("number");
    });
  });

  describe("Error Handling Scenarios", () => {
    test("should handle HTTP method restrictions", () => {
      const exception = new MethodNotAllowedException("HTTP method not allowed", "TEST", {
        requestedMethod: "DELETE",
        allowedMethods: ["GET", "POST", "PUT"],
        resource: "/api/users/123",
        reason: "Delete operation not permitted",
      });

      expect(exception.message).toBe("HTTP method not allowed");
      expect(exception.data?.requestedMethod).toBe("DELETE");
      expect(exception.data?.allowedMethods).toHaveLength(3);
    });

    test("should handle REST endpoint method restrictions", () => {
      const exception = new MethodNotAllowedException("REST method not supported", "TEST", {
        endpoint: "/api/v1/products",
        method: "PATCH",
        supportedMethods: ["GET", "POST", "PUT", "DELETE"],
        httpVersion: "1.1",
      });

      expect(exception.message).toBe("REST method not supported");
      expect(exception.data?.endpoint).toBe("/api/v1/products");
      expect(exception.data?.method).toBe("PATCH");
    });

    test("should handle resource-specific method restrictions", () => {
      const exception = new MethodNotAllowedException("Resource method not allowed", "TEST", {
        resourceType: "readonly",
        resourceId: "config_123",
        attemptedOperation: "UPDATE",
        allowedOperations: ["READ"],
      });

      expect(exception.message).toBe("Resource method not allowed");
      expect(exception.data?.resourceType).toBe("readonly");
      expect(exception.data?.allowedOperations).toContain("READ");
    });

    test("should handle API versioning method restrictions", () => {
      const exception = new MethodNotAllowedException("Method deprecated in API version", "TEST", {
        method: "HEAD",
        apiVersion: "v2",
        deprecatedIn: "v2.0",
        alternative: "Use GET with minimal response",
        endpoint: "/api/v2/status",
      });

      expect(exception.message).toBe("Method deprecated in API version");
      expect(exception.data?.method).toBe("HEAD");
      expect(exception.data?.apiVersion).toBe("v2");
    });
  });

  describe("Stack Trace and Debugging", () => {
    test("should maintain proper stack trace", () => {
      function throwMethodNotAllowedException() {
        throw new MethodNotAllowedException("Stack trace test", "TEST");
      }

      try {
        throwMethodNotAllowedException();
        // biome-ignore lint/suspicious/noExplicitAny: trust me
      } catch (error: any) {
        expect(error).toBeInstanceOf(MethodNotAllowedException);
        expect(error.stack).toBeDefined();
        expect(error.stack).toContain("throwMethodNotAllowedException");
        expect(error.stack).toContain("Stack trace test");
      }
    });

    test("should support stackToJson method from parent Exception", () => {
      const exception = new MethodNotAllowedException("JSON stack test", "TEST");
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
      const exception = new MethodNotAllowedException("Serialization test", "TEST", {
        component: "api-router",
        version: "3.1.0",
        strictMode: true,
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
      expect(parsed.name).toBe("MethodNotAllowedException");
      expect(parsed.status).toBe(405);
      expect(parsed.data).toEqual({
        component: "api-router",
        version: "3.1.0",
        strictMode: true,
      });
    });

    test("should have correct toString representation", () => {
      const exception = new MethodNotAllowedException("ToString test", "TEST");
      const stringRep = exception.toString();

      expect(stringRep).toContain("MethodNotAllowedException");
      expect(stringRep).toContain("ToString test");
    });
  });

  describe("Edge Cases", () => {
    test("should handle empty message", () => {
      const exception = new MethodNotAllowedException("", "TEST");

      expect(exception.message).toBe("");
      expect(exception.status).toBe(HttpStatus.Code.MethodNotAllowed);
    });

    test("should handle very long messages", () => {
      const longMessage = "x".repeat(1000);
      const exception = new MethodNotAllowedException(longMessage, "TEST");

      expect(exception.message).toBe(longMessage);
      expect(exception.message.length).toBe(1000);
    });

    test("should handle special characters in message", () => {
      const specialMessage = "Method Not Allowed: 特殊文字 🚫 with émojis and ñumbers 123!@#$%^&*()";
      const exception = new MethodNotAllowedException(specialMessage, "TEST");

      expect(exception.message).toBe(specialMessage);
    });

    test("should handle complex nested data", () => {
      const complexData = {
        request: {
          method: "TRACE",
          url: "/api/debug",
          headers: {
            "user-agent": "TestClient/1.0",
          },
        },
        restrictions: {
          allowedMethods: ["GET", "POST", "PUT"],
          deniedReasons: ["security", "not_implemented"],
        },
        metadata: {
          timestamp: new Date().toISOString(),
          clientIp: "192.168.1.100",
          userAgent: "TestClient/1.0",
        },
        suggestions: {
          alternative: "Use GET method instead",
          documentation: "https://api.example.com/docs",
        },
      };

      const exception = new MethodNotAllowedException("Complex data test", "TEST", complexData);

      expect(exception.data).toEqual(complexData);
      expect((exception.data?.request as { method: string })?.method).toBe("TRACE");
      expect((exception.data?.restrictions as { allowedMethods: string[] })?.allowedMethods).toHaveLength(3);
      expect((exception.data?.restrictions as { deniedReasons: string[] })?.deniedReasons).toContain("security");
      expect((exception.data?.suggestions as { alternative: string })?.alternative).toContain("GET method");
    });

    test("should handle HTTP method specific data structures", () => {
      interface HttpMethodInfo {
        method: string;
        safe: boolean;
        idempotent: boolean;
        cacheable: boolean;
        allowedInForms: boolean;
        rfc: string;
      }

      const methodData: HttpMethodInfo = {
        method: "CONNECT",
        safe: false,
        idempotent: false,
        cacheable: false,
        allowedInForms: false,
        rfc: "RFC 7231",
      };

      const exception = new MethodNotAllowedException(
        "HTTP method analysis failed",
        "TEST",
        methodData as unknown as Record<string, unknown>,
      );

      expect(exception.data?.method).toBe("CONNECT");
      expect((exception.data as { safe: boolean })?.safe).toBe(false);
      expect((exception.data as { idempotent: boolean })?.idempotent).toBe(false);
      expect((exception.data as { rfc: string })?.rfc).toBe("RFC 7231");
    });
  });

  describe("HTTP Method-Specific Scenarios", () => {
    test("should handle common HTTP method restrictions", () => {
      const exception = new MethodNotAllowedException("Standard HTTP method not allowed", "TEST", {
        requestedMethod: "OPTIONS",
        endpoint: "/api/v1/users",
        allowedMethods: ["GET", "POST", "PUT", "DELETE"],
        corsEnabled: false,
        preflightRequired: true,
        reason: "CORS preflight disabled for this endpoint",
      });

      expect(exception.message).toBe("Standard HTTP method not allowed");
      expect(exception.data?.requestedMethod).toBe("OPTIONS");
      expect(exception.data?.corsEnabled).toBe(false);
      expect(exception.data?.allowedMethods).toHaveLength(4);
    });

    test("should handle custom HTTP method restrictions", () => {
      const exception = new MethodNotAllowedException("Custom HTTP method not supported", "TEST", {
        customMethod: "PURGE",
        standardMethods: ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"],
        serverCapabilities: ["standard-http", "rest-api"],
        missingCapability: "custom-methods",
        suggestion: "Use DELETE for cache invalidation",
      });

      expect(exception.message).toBe("Custom HTTP method not supported");
      expect(exception.data?.customMethod).toBe("PURGE");
      expect(exception.data?.standardMethods).toContain("DELETE");
      expect(exception.data?.suggestion).toContain("DELETE");
    });

    test("should handle safe vs unsafe method restrictions", () => {
      const exception = new MethodNotAllowedException("Unsafe method not allowed", "TEST", {
        method: "POST",
        methodType: "unsafe",
        safeMethodsOnly: true,
        allowedSafeMethods: ["GET", "HEAD", "OPTIONS"],
        resource: "/api/readonly/data",
        securityPolicy: "read-only-api",
      });

      expect(exception.message).toBe("Unsafe method not allowed");
      expect(exception.data?.method).toBe("POST");
      expect(exception.data?.methodType).toBe("unsafe");
      expect(exception.data?.safeMethodsOnly).toBe(true);
    });

    test("should handle idempotent method requirements", () => {
      const exception = new MethodNotAllowedException("Non-idempotent method not allowed", "TEST", {
        method: "POST",
        requiresIdempotency: true,
        idempotentMethods: ["GET", "PUT", "DELETE", "HEAD", "OPTIONS"],
        operation: "critical-update",
        retryPolicy: "automatic",
        reason: "Operation must be safely retryable",
      });

      expect(exception.message).toBe("Non-idempotent method not allowed");
      expect(exception.data?.method).toBe("POST");
      expect(exception.data?.requiresIdempotency).toBe(true);
      expect(exception.data?.idempotentMethods).toContain("PUT");
    });
  });
});
