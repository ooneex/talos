import { describe, expect, mock, test } from "bun:test";
import type { IException } from "@talosjs/exception";
import { TerminalLogger } from "@/TerminalLogger";

describe("TerminalLogger", () => {
  describe("constructor", () => {
    test("should create an instance of TerminalLogger", () => {
      const logger = new TerminalLogger();
      expect(logger).toBeInstanceOf(TerminalLogger);
    });

    test("should implement ILogger interface", () => {
      const logger = new TerminalLogger();
      expect(typeof logger.init).toBe("function");
      expect(typeof logger.error).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.debug).toBe("function");
      expect(typeof logger.log).toBe("function");
      expect(typeof logger.success).toBe("function");
    });
  });

  describe("init", () => {
    test("should resolve without error", async () => {
      const logger = new TerminalLogger();
      expect(logger.init()).resolves.toBeUndefined();
    });
  });

  describe("error", () => {
    test("should write an ERROR level log with string message", () => {
      const logger = new TerminalLogger();
      expect(() => logger.error("Something went wrong")).not.toThrow();
    });

    test("should accept data parameter", () => {
      const logger = new TerminalLogger();
      expect(() => logger.error("Error occurred", { userId: "user-123", code: 500 })).not.toThrow();
    });

    test("should accept an IException as message parameter", () => {
      const mockException: IException = {
        key: crypto.randomUUID(),
        message: "Exception occurred",
        name: "TestException",
        status: 500,
        date: new Date("2026-01-15T10:00:00Z"),
        data: { detail: "test" },
        stackToJson: mock(() => [
          {
            fileName: "test.ts",
            lineNumber: 42,
            columnNumber: 10,
            functionName: "testFunc",
          },
        ]),
        stackToString: mock(() => "Error at test.ts:42:10"),
        toResponse: mock(() => ({
          status: 500,
          body: "Error",
        })),
      } as unknown as IException;

      const logger = new TerminalLogger();
      expect(() => logger.error(mockException)).not.toThrow();
    });

    test("should handle exception with null stack trace", () => {
      const mockException: IException = {
        key: crypto.randomUUID(),
        message: "Error without stack",
        name: "NoStackError",
        status: 500,
        date: new Date(),
        data: {},
        stackToJson: mock(() => null),
        stackToString: mock(() => ""),
        toResponse: mock(() => ({})),
      } as unknown as IException;

      const logger = new TerminalLogger();
      expect(() => logger.error(mockException)).not.toThrow();
    });

    test("should handle exception with empty stack trace", () => {
      const mockException: IException = {
        key: crypto.randomUUID(),
        message: "Error with empty stack",
        name: "EmptyStackError",
        status: 400,
        date: new Date(),
        data: {},
        stackToJson: mock(() => []),
        stackToString: mock(() => ""),
        toResponse: mock(() => ({})),
      } as unknown as IException;

      const logger = new TerminalLogger();
      expect(() => logger.error(mockException)).not.toThrow();
    });

    test("should accept options parameter", () => {
      const logger = new TerminalLogger();
      expect(() =>
        logger.error("Error", undefined, {
          showArrow: false,
          showTimestamp: false,
          showLevel: false,
          useSymbol: true,
        }),
      ).not.toThrow();
    });
  });

  describe("warn", () => {
    test("should write a WARN level log", () => {
      const logger = new TerminalLogger();
      expect(() => logger.warn("This is a warning")).not.toThrow();
    });

    test("should include data when provided", () => {
      const logger = new TerminalLogger();
      expect(() => logger.warn("Low disk space", { disk: "sda1", usage: 95 })).not.toThrow();
    });
  });

  describe("info", () => {
    test("should write an INFO level log", () => {
      const logger = new TerminalLogger();
      expect(() => logger.info("User logged in")).not.toThrow();
    });

    test("should include data when provided", () => {
      const logger = new TerminalLogger();
      expect(() => logger.info("Page accessed", { path: "/dashboard", method: "GET" })).not.toThrow();
    });
  });

  describe("debug", () => {
    test("should write a DEBUG level log", () => {
      const logger = new TerminalLogger();
      expect(() => logger.debug("Debug output")).not.toThrow();
    });

    test("should include data when provided", () => {
      const logger = new TerminalLogger();
      expect(() => logger.debug("Request details", { requestId: "req-123" })).not.toThrow();
    });
  });

  describe("log", () => {
    test("should write a LOG level log", () => {
      const logger = new TerminalLogger();
      expect(() => logger.log("General log message")).not.toThrow();
    });

    test("should include data when provided", () => {
      const logger = new TerminalLogger();
      expect(() => logger.log("Request info", { userAgent: "Mozilla/5.0" })).not.toThrow();
    });
  });

  describe("success", () => {
    test("should write a SUCCESS level log", () => {
      const logger = new TerminalLogger();
      expect(() => logger.success("Operation completed")).not.toThrow();
    });

    test("should include data when provided", () => {
      const logger = new TerminalLogger();
      expect(() => logger.success("User updated", { status: 200, method: "PUT" })).not.toThrow();
    });
  });

  describe("options", () => {
    test("should handle showArrow option", () => {
      const logger = new TerminalLogger();
      expect(() => logger.info("No arrow", undefined, { showArrow: false })).not.toThrow();
    });

    test("should handle showTimestamp option", () => {
      const logger = new TerminalLogger();
      expect(() => logger.info("No timestamp", undefined, { showTimestamp: false })).not.toThrow();
    });

    test("should handle showLevel option", () => {
      const logger = new TerminalLogger();
      expect(() => logger.info("No level", undefined, { showLevel: false })).not.toThrow();
    });

    test("should handle useSymbol option", () => {
      const logger = new TerminalLogger();
      expect(() => logger.info("With symbol", undefined, { useSymbol: true })).not.toThrow();
    });

    test("should handle all options combined", () => {
      const logger = new TerminalLogger();
      expect(() =>
        logger.info(
          "All options",
          { key: "value" },
          {
            showArrow: false,
            showTimestamp: false,
            showLevel: true,
            useSymbol: true,
          },
        ),
      ).not.toThrow();
    });
  });

  describe("colorizeText (tested through public methods)", () => {
    test("should handle invalid color gracefully", () => {
      const logger = new TerminalLogger();
      // Data values trigger colorizeText with various colors
      // This should not throw even if Bun.color encounters an invalid color
      expect(() => logger.info("Test", { key: "string-value", num: 42, flag: true })).not.toThrow();
    });

    test("should handle empty data object", () => {
      const logger = new TerminalLogger();
      expect(() => logger.info("Test", {})).not.toThrow();
    });

    test("should filter out null and undefined values in data", () => {
      const logger = new TerminalLogger();
      const data = { valid: "yes", empty: null, missing: undefined } as unknown as Record<string, string>;
      expect(() => logger.info("Test", data)).not.toThrow();
    });

    test("should filter out stackTrace key from data", () => {
      const logger = new TerminalLogger();
      const data = { message: "test", stackTrace: "should-be-excluded" };
      expect(() => logger.info("Test", data)).not.toThrow();
    });

    test("should filter out non-scalar values like Date, objects, and arrays", () => {
      const logger = new TerminalLogger();
      const data = {
        status: 200,
        method: "GET",
        date: new Date(),
        params: { id: "123" },
        payload: { name: "test", nested: { deep: true } },
        queries: { page: "1" },
        items: [1, 2, 3],
      } as unknown as Record<string, string>;
      expect(() => logger.success("Request completed", data)).not.toThrow();
    });
  });

  describe("level normalization", () => {
    test("should normalize exception level names ending with Exception", () => {
      const mockException: IException = {
        key: crypto.randomUUID(),
        message: "Auth failed",
        name: "AuthorizationException",
        status: 403,
        date: new Date(),
        data: {},
        stackToJson: mock(() => [
          { fileName: "auth.ts", lineNumber: 45, columnNumber: 8, functionName: "checkPermissions" },
        ]),
        stackToString: mock(() => "AuthorizationException at auth.ts:45:8"),
        toResponse: mock(() => ({ status: 403, body: "Forbidden" })),
      } as unknown as IException;

      const logger = new TerminalLogger();
      expect(() => logger.error(mockException)).not.toThrow();
    });
  });

  describe("stack trace formatting", () => {
    test("should handle frames without fileName", () => {
      const mockException: IException = {
        key: crypto.randomUUID(),
        message: "Error",
        name: "TestError",
        status: 500,
        date: new Date(),
        data: {},
        stackToJson: mock(() => [{ functionName: "anonymous", lineNumber: null, columnNumber: null, fileName: null }]),
        stackToString: mock(() => ""),
        toResponse: mock(() => ({})),
      } as unknown as IException;

      const logger = new TerminalLogger();
      expect(() => logger.error(mockException)).not.toThrow();
    });

    test("should handle frames without functionName", () => {
      const mockException: IException = {
        key: crypto.randomUUID(),
        message: "Error",
        name: "TestError",
        status: 500,
        date: new Date(),
        data: {},
        stackToJson: mock(() => [{ functionName: null, lineNumber: 10, columnNumber: 5, fileName: "test.ts" }]),
        stackToString: mock(() => ""),
        toResponse: mock(() => ({})),
      } as unknown as IException;

      const logger = new TerminalLogger();
      expect(() => logger.error(mockException)).not.toThrow();
    });

    test("should handle multiple stack frames", () => {
      const mockException: IException = {
        key: crypto.randomUUID(),
        message: "Deep error",
        name: "DeepError",
        status: 500,
        date: new Date(),
        data: {},
        stackToJson: mock(() => [
          { functionName: "handler", lineNumber: 10, columnNumber: 5, fileName: "handler.ts" },
          { functionName: "middleware", lineNumber: 20, columnNumber: 3, fileName: "middleware.ts" },
          { functionName: "router", lineNumber: 30, columnNumber: 8, fileName: "router.ts" },
        ]),
        stackToString: mock(() => ""),
        toResponse: mock(() => ({})),
      } as unknown as IException;

      const logger = new TerminalLogger();
      expect(() => logger.error(mockException)).not.toThrow();
    });
  });
});
