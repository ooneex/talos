import { describe, expect, test } from "bun:test";
import { Exception } from "@/index";

describe("Exception", () => {
  describe("Name", () => {
    test("should have correct exception name", () => {
      const exception = new Exception("Test message");

      expect(exception.name).toBe("Exception");
    });
  });

  describe("Immutable Data", () => {
    test("should have immutable data property", () => {
      const data = { key: "value", count: 42 };
      const exception = new Exception("Test message", { data });

      expect(Object.isFrozen(exception.data)).toBe(true);
      expect(() => {
        exception.data.key = "modified";
      }).toThrow();
    });
  });

  describe("Constructor", () => {
    test("should create Exception with string message only", () => {
      const message = "Test error message";
      const exception = new Exception(message);

      expect(exception).toBeInstanceOf(Exception);
      expect(exception).toBeInstanceOf(Error);
      expect(exception.message).toBe(message);
      expect(exception.name).toBe("Exception");
      expect(exception.key).toBeNull();
      expect(exception.date).toBeInstanceOf(Date);
      expect(exception.status).toBe(500);
      expect(exception.data).toEqual({});
      expect(exception.native).toBeUndefined();
    });

    test("should create Exception with Error object", () => {
      const originalError = new Error("Original error");
      const exception = new Exception(originalError);

      expect(exception.message).toBe("Original error");
      expect(exception.name).toBe("Exception");
      expect(exception.date).toBeInstanceOf(Date);
      expect(exception.native).toBe(originalError);
      expect(exception.status).toBe(500);
      expect(exception.data).toEqual({});
    });

    test("should create Exception with string message and options", () => {
      const message = "Test error with options";
      const status = 400;
      const data = { userId: 123, action: "login" };
      const exception = new Exception(message, { status, data });

      expect(exception.message).toBe(message);
      expect(exception.status).toBe(status);
      expect(exception.data).toEqual(data);
      expect(exception.native).toBeUndefined();
    });

    test("should create Exception with Error object and options", () => {
      const originalError = new Error("Original error");
      const status = 500;
      const data = { trace: "error_trace" };
      const exception = new Exception(originalError, { status, data });

      expect(exception.message).toBe("Original error");
      expect(exception.status).toBe(status);
      expect(exception.data).toEqual(data);
      expect(exception.native).toBe(originalError);
    });

    test("should handle empty options", () => {
      const exception = new Exception("Test", {});

      expect(exception.message).toBe("Test");
      expect(exception.status).toBe(500);
      expect(exception.data).toEqual({});
    });

    test("should handle partial options", () => {
      const ex1 = new Exception("Test", { status: 404 });
      expect(ex1.status).toBe(404);
      expect(ex1.data).toEqual({});

      const ex2 = new Exception("Test", { data: { key: "value" } });
      expect(ex2.status).toBe(500);
      expect(ex2.data?.key).toBe("value");
    });
  });

  describe("Inheritance and Properties", () => {
    test("should have null key by default", () => {
      const exception = new Exception("Test");

      expect(exception.key).toBeNull();
    });

    test("should accept custom key via options", () => {
      const exception = new Exception("Test", { key: "custom-key" });

      expect(exception.key).toBe("custom-key");
    });

    test("should accept null key via options", () => {
      const exception = new Exception("Test", { key: null });

      expect(exception.key).toBeNull();
    });

    test("should have readonly date property", () => {
      const beforeDate = Date.now();
      const exception = new Exception("Test");
      const afterDate = Date.now();

      expect(exception.date).toBeInstanceOf(Date);
      expect(exception.date.getTime()).toBeGreaterThanOrEqual(beforeDate);
      expect(exception.date.getTime()).toBeLessThanOrEqual(afterDate);

      // Date should be immutable
      const originalDate = exception.date;
      expect(exception.date).toBe(originalDate);
    });

    test("should have readonly status property", () => {
      const exception = new Exception("Test", { status: 400 });

      expect(exception.status).toBe(400);
      expect(typeof exception.status).toBe("number");
    });

    test("should have readonly data property", () => {
      const data = { key: "value" };
      const exception = new Exception("Test", { data });

      expect(exception.data).toEqual(data);
      expect(Object.isFrozen(exception.data)).toBe(true);
    });

    test("should freeze data property to prevent mutation", () => {
      const data = {
        count: 42,
        nested: { value: "test" },
        array: [1, 2, 3],
      };
      const exception = new Exception("Test", { data });

      expect(Object.isFrozen(exception.data)).toBe(true);
      // Note: Exception only does shallow freeze, nested objects are not frozen
      expect(Object.isFrozen(exception.data?.nested)).toBe(false);
      expect(Object.isFrozen(exception.data?.array)).toBe(false);

      // Should not allow modifications
      expect(() => {
        exception.data.count = 100;
      }).toThrow();

      // Nested objects are not frozen (shallow freeze only)
      expect(() => {
        // @ts-expect-error - testing unfrozen nested object
        exception.data.nested.value = "modified";
      }).not.toThrow();

      expect(() => {
        // @ts-expect-error - testing unfrozen array
        exception.data.array.push(4);
      }).not.toThrow();
    });

    test("should not freeze data when data is undefined", () => {
      const exception = new Exception("Test");
      expect(exception.data).toEqual({});
    });

    test("should have readonly native property", () => {
      const originalError = new Error("Original");
      const exception = new Exception(originalError);

      expect(exception.native).toBe(originalError);
    });

    test("should inherit from Error", () => {
      const exception = new Exception("Test");
      expect(exception).toBeInstanceOf(Error);
    });

    test("should have stack trace", () => {
      const exception = new Exception("Test");
      expect(exception.stack).toBeDefined();
      expect(typeof exception.stack).toBe("string");
    });
  });

  describe("Generic Type Support", () => {
    test("should support string data type", () => {
      const data = { message: "error message", code: "ERR_001" };
      const exception = new Exception("Test", { data });

      expect(exception.data).toEqual(data);
      expect(typeof exception.data?.message).toBe("string");
    });

    test("should support number data type", () => {
      const data = { statusCode: 500, retryCount: 3 };
      const exception = new Exception("Test", { data });

      expect(exception.data).toEqual(data);
      expect(typeof exception.data?.statusCode).toBe("number");
    });

    test("should support complex object data type", () => {
      interface UserData {
        user: {
          id: number;
          name: string;
          roles: string[];
        };
      }

      const data: UserData = {
        user: { id: 123, name: "John", roles: ["admin", "user"] },
      };
      const exception = new Exception("Test", { data: data as unknown as Record<string, unknown> });

      expect(exception.data).toEqual(data as unknown as Record<string, unknown>);
      expect((exception.data?.user as { id: number })?.id).toBe(123);
      expect((exception.data?.user as { roles: string[] })?.roles).toContain("admin");
    });
  });

  describe("Error Handling Scenarios", () => {
    test("should handle application errors", () => {
      const exception = new Exception("Application error occurred", {
        status: 500,
        data: {
          component: "user-service",
          operation: "create_user",
          timestamp: new Date().toISOString(),
          errorCode: "APP_ERR_001",
        },
      });

      expect(exception.message).toBe("Application error occurred");
      expect(exception.status).toBe(500);
      expect(exception.data?.component).toBe("user-service");
      expect(exception.data?.operation).toBe("create_user");
    });

    test("should handle system errors", () => {
      const exception = new Exception("System resource unavailable", {
        status: 503,
        data: {
          resource: "database",
          maxRetries: 3,
          lastAttempt: new Date().toISOString(),
          available: false,
        },
      });

      expect(exception.message).toBe("System resource unavailable");
      expect(exception.status).toBe(503);
      expect(exception.data?.resource).toBe("database");
      expect(exception.data?.available).toBe(false);
    });

    test("should handle validation errors", () => {
      const exception = new Exception("Data validation failed", {
        status: 422,
        data: {
          field: "email",
          value: "invalid-email",
          rule: "email_format",
          message: "Must be a valid email address",
        },
      });

      expect(exception.message).toBe("Data validation failed");
      expect(exception.status).toBe(422);
      expect(exception.data?.field).toBe("email");
      expect(exception.data?.rule).toBe("email_format");
    });

    test("should handle wrapped native errors", () => {
      const originalError = new TypeError("Cannot read property 'name' of undefined");
      const exception = new Exception(originalError, {
        status: 500,
        data: {
          context: "user_profile_processing",
          operation: "get_user_name",
        },
      });

      expect(exception.message).toBe("Cannot read property 'name' of undefined");
      expect(exception.native).toBe(originalError);
      expect(exception.data?.context).toBe("user_profile_processing");
    });
  });

  describe("Stack Trace and Debugging", () => {
    test("should maintain proper stack trace", () => {
      function throwException() {
        throw new Exception("Stack trace test");
      }

      try {
        throwException();
        // biome-ignore lint/suspicious/noExplicitAny: trust me
      } catch (error: any) {
        expect(error).toBeInstanceOf(Exception);
        expect(error.stack).toBeDefined();
        expect(error.stack).toContain("throwException");
        expect(error.stack).toContain("Stack trace test");
      }
    });

    test("should support stackToJson method", () => {
      const exception = new Exception("JSON stack test");
      const stackJson = exception.stackToJson();

      expect(stackJson).toBeDefined();
      if (stackJson) {
        expect(Array.isArray(stackJson)).toBe(true);
        expect(stackJson.length).toBeGreaterThan(0);
        expect(stackJson[0]).toHaveProperty("source");
      }
    });

    test("should return null when stack is undefined", () => {
      const exception = new Exception("Test");
      // @ts-expect-error Testing edge case where stack is undefined
      exception.stack = undefined;
      const result = exception.stackToJson();

      expect(result).toBeNull();
    });

    test("should parse stack trace frames correctly", () => {
      const exception = new Exception("Test");
      exception.stack = `Error: Test
    at testFunction (/path/to/file.js:10:5)
    at Object.method (/path/to/another.js:20:15)`;

      const result = exception.stackToJson();

      expect(result).not.toBeNull();
      expect(result).toHaveLength(2);

      if (result) {
        expect(result[0]?.functionName).toBe("testFunction");
        expect(result[0]?.fileName).toBe("/path/to/file.js");
        expect(result[0]?.lineNumber).toBe(10);
        expect(result[0]?.columnNumber).toBe(5);

        expect(result[1]?.functionName).toBe("Object.method");
        expect(result[1]?.fileName).toBe("/path/to/another.js");
        expect(result[1]?.lineNumber).toBe(20);
        expect(result[1]?.columnNumber).toBe(15);
      }
    });

    test("should handle malformed stack frames", () => {
      const exception = new Exception("Test");
      exception.stack = `Error: Test
    malformed line without proper format
    at validFunction (/path/file.js:1:1)`;

      const result = exception.stackToJson();

      expect(result).not.toBeNull();
      expect(result).toHaveLength(2);

      if (result) {
        expect(result[0]?.source).toBe("malformed line without proper format");

        expect(result[0]?.functionName).toBeUndefined();

        expect(result[1]?.functionName).toBe("validFunction");
        expect(result[1]?.fileName).toBe("/path/file.js");
      }
    });
  });

  describe("Serialization and Inspection", () => {
    test("should be JSON serializable", () => {
      const exception = new Exception("Serialization test", {
        status: 400,
        data: { component: "base-exception", version: "1.0.0" },
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
      expect(parsed.name).toBe("Exception");
      expect(parsed.status).toBe(400);
      expect(parsed.data).toEqual({
        component: "base-exception",
        version: "1.0.0",
      });
    });

    test("should have correct toString representation", () => {
      const exception = new Exception("ToString test");
      const stringRep = exception.toString();

      expect(stringRep).toContain("Exception");
      expect(stringRep).toContain("ToString test");
    });

    test("should be JSON serializable with stackToJson", () => {
      const exception = new Exception("Test", {
        status: 500,
        data: { key: "value" },
      });

      const json = {
        message: exception.message,
        status: exception.status,
        data: exception.data,
        date: exception.date,
        stackFrames: exception.stackToJson(),
      };

      const serialized = JSON.stringify(json);
      const parsed = JSON.parse(serialized);

      expect(parsed.message).toBe("Test");
      expect(parsed.status).toBe(500);
      expect(parsed.data.key).toBe("value");
      expect(Array.isArray(parsed.stackFrames)).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    test("should handle empty message", () => {
      const exception = new Exception("");

      expect(exception.message).toBe("");
    });

    test("should handle very long messages", () => {
      const longMessage = "x".repeat(1000);
      const exception = new Exception(longMessage);

      expect(exception.message).toBe(longMessage);
      expect(exception.message.length).toBe(1000);
    });

    test("should handle special characters in message", () => {
      const specialMessage = "Error: 特殊文字 ⚠️ with émojis and ñumbers 123!@#$%^&*()";
      const exception = new Exception(specialMessage);

      expect(exception.message).toBe(specialMessage);
    });

    test("should handle null and undefined in data", () => {
      const data = {
        nullValue: null,
        undefinedValue: undefined,
      };
      const exception = new Exception("Test", { data });

      expect(exception.data?.nullValue).toBeNull();
      expect(exception.data?.undefinedValue).toBeUndefined();
    });

    test("should handle circular references in data", () => {
      const circularData: Record<string, unknown> = {
        name: "circular",
      };
      circularData.self = circularData;

      const exception = new Exception("Circular test", {
        data: { circular: circularData },
      });

      expect((exception.data?.circular as { name: string })?.name).toBe("circular");
      expect((exception.data?.circular as { self: unknown })?.self).toBe(circularData);
    });

    test("should handle nested Error objects", () => {
      const originalError = new TypeError("Type error");
      const nestedError = new ReferenceError("Reference error");
      (originalError as TypeError & { cause?: Error }).cause = nestedError;

      const exception = new Exception(originalError);

      expect(exception.message).toBe("Type error");
      expect(exception.native).toBe(originalError);
      expect((exception.native as TypeError & { cause?: Error })?.cause).toBe(nestedError);
    });

    test("should handle Error objects with custom properties", () => {
      const customError = new Error("Custom error");
      // biome-ignore lint/suspicious/noExplicitAny: testing custom properties
      (customError as any).code = "CUSTOM_001";
      // biome-ignore lint/suspicious/noExplicitAny: testing custom properties
      (customError as any).severity = "high";

      const exception = new Exception(customError, { status: 500 });

      expect(exception.message).toBe("Custom error");
      expect(exception.status).toBe(500);
      // biome-ignore lint/suspicious/noExplicitAny: testing custom properties
      expect((exception.native as any)?.code).toBe("CUSTOM_001");
      // biome-ignore lint/suspicious/noExplicitAny: testing custom properties
      expect((exception.native as any)?.severity).toBe("high");
    });

    test("should handle zero status code", () => {
      const exception = new Exception("Test", { status: 0 as never });
      expect(exception.status).toBe(500); // 0 is falsy, so defaults to 500
    });
  });

  describe("Exception-Specific Scenarios", () => {
    test("should handle configuration errors", () => {
      const exception = new Exception("Configuration validation failed", {
        status: 500,
        data: {
          configFile: "app.config.json",
          invalidFields: ["database.host", "redis.port"],
          validationRules: {
            "database.host": "required|string",
            "redis.port": "required|integer|min:1|max:65535",
          },
          suggestion: "Check configuration file format and required fields",
        },
      });

      expect(exception.message).toBe("Configuration validation failed");
      expect(exception.data?.configFile).toBe("app.config.json");
      expect(exception.data?.invalidFields).toHaveLength(2);
      expect(exception.data?.invalidFields).toContain("database.host");
    });

    test("should handle service integration errors", () => {
      const exception = new Exception("External service integration failed", {
        status: 502,
        data: {
          service: "payment-gateway",
          endpoint: "https://api.payment.com/v1/charge",
          method: "POST",
          responseStatus: 503,
          retryAttempt: 3,
          maxRetries: 5,
          lastError: "Service temporarily unavailable",
          circuitBreakerOpen: true,
        },
      });

      expect(exception.message).toBe("External service integration failed");
      expect(exception.data?.service).toBe("payment-gateway");
      expect(exception.data?.retryAttempt).toBe(3);
      expect(exception.data?.circuitBreakerOpen).toBe(true);
    });

    test("should handle business logic errors", () => {
      const exception = new Exception("Business rule violation", {
        status: 422,
        data: {
          rule: "insufficient_balance",
          entity: "user_account",
          entityId: "acc_123456",
          currentBalance: 50.0,
          requiredAmount: 100.0,
          currency: "USD",
          operation: "transfer",
          businessContext: {
            transferLimit: 1000.0,
            dailyTransactions: 5,
            maxDailyTransactions: 10,
          },
        },
      });

      expect(exception.message).toBe("Business rule violation");
      expect(exception.data?.rule).toBe("insufficient_balance");
      expect(exception.data?.currentBalance).toBe(50.0);
      expect((exception.data?.businessContext as { dailyTransactions: number })?.dailyTransactions).toBe(5);
    });

    test("should handle data transformation errors", () => {
      const exception = new Exception("Data transformation failed", {
        status: 422,
        data: {
          transformer: "user-profile-transformer",
          inputFormat: "xml",
          outputFormat: "json",
          validationErrors: [
            { field: "birthDate", error: "Invalid date format" },
            { field: "email", error: "Invalid email format" },
          ],
          transformationStep: "validation",
          inputSize: 2048,
          partialOutput: null,
        },
      });

      expect(exception.message).toBe("Data transformation failed");
      expect(exception.data?.transformer).toBe("user-profile-transformer");
      expect(exception.data?.validationErrors).toHaveLength(2);
      expect(exception.data?.transformationStep).toBe("validation");
    });

    test("should handle async operation timeouts", () => {
      const exception = new Exception("Async operation timeout", {
        status: 408,
        data: {
          operation: "database_query",
          timeout: 30_000,
          elapsed: 30_001,
          query: "SELECT * FROM users WHERE active = true",
          connectionPool: {
            active: 8,
            idle: 2,
            max: 10,
          },
          retryPolicy: {
            maxRetries: 3,
            backoffMultiplier: 2,
            initialDelay: 1000,
          },
        },
      });

      expect(exception.message).toBe("Async operation timeout");
      expect(exception.data?.elapsed as number).toBeGreaterThan((exception.data?.timeout as number) || 0);
      expect((exception.data?.connectionPool as { active: number })?.active).toBe(8);
      expect((exception.data?.retryPolicy as { maxRetries: number })?.maxRetries).toBe(3);
    });

    test("should handle complex nested error scenarios", () => {
      interface ComplexErrorData {
        context: {
          requestId: string;
          userId?: string;
          sessionId: string;
        };
        errorChain: {
          primary: string;
          secondary?: string;
          root?: string;
        };
        systemState: {
          memoryUsage: number;
          cpuUsage: number;
          activeConnections: number;
        };
        recovery: {
          possible: boolean;
          suggestions: string[];
          automaticRetry: boolean;
        };
      }

      const complexData: ComplexErrorData = {
        context: {
          requestId: "req_abc123",
          userId: "user_456",
          sessionId: "sess_xyz789",
        },
        errorChain: {
          primary: "Database connection lost",
          secondary: "Connection pool exhausted",
          root: "Network timeout",
        },
        systemState: {
          memoryUsage: 0.85,
          cpuUsage: 0.92,
          activeConnections: 150,
        },
        recovery: {
          possible: true,
          suggestions: ["Restart connection pool", "Check network connectivity"],
          automaticRetry: false,
        },
      };

      const exception = new Exception("System failure with complex context", {
        status: 500,
        data: complexData as unknown as Record<string, unknown>,
      });

      expect((exception.data?.context as { requestId: string })?.requestId).toBe("req_abc123");
      expect((exception.data?.errorChain as { primary: string })?.primary).toBe("Database connection lost");
      expect((exception.data?.systemState as { memoryUsage: number })?.memoryUsage).toBe(0.85);
      expect((exception.data?.recovery as { suggestions: string[] })?.suggestions).toHaveLength(2);
      expect((exception.data?.recovery as { possible: boolean })?.possible).toBe(true);
    });
  });
});
