import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@talosjs/app-env";
import type { IException } from "@talosjs/exception";
import { BetterstackLogger } from "@/BetterstackLogger";
import { LoggerException } from "@/LoggerException";

const mockError = mock((_message: string, _data?: Record<string, unknown>) => {});
const mockWarn = mock((_message: string, _data?: Record<string, unknown>) => {});
const mockInfo = mock((_message: string, _data?: Record<string, unknown>) => {});
const mockDebug = mock((_message: string, _data?: Record<string, unknown>) => {});
const mockFlush = mock(() => Promise.resolve());

mock.module("@logtail/node", () => ({
  Logtail: mock(() => ({
    error: mockError,
    warn: mockWarn,
    info: mockInfo,
    debug: mockDebug,
    flush: mockFlush,
  })),
}));

describe("BetterstackLogger", () => {
  beforeEach(() => {
    mockError.mockClear();
    mockWarn.mockClear();
    mockInfo.mockClear();
    mockDebug.mockClear();
    mockFlush.mockClear();
    Bun.env.BETTERSTACK_LOGGER_SOURCE_TOKEN = "test-token";
    delete Bun.env.BETTERSTACK_LOGGER_INGESTING_HOST;
  });

  describe("constructor", () => {
    test("should create an instance of BetterstackLogger", () => {
      const logger = new BetterstackLogger(new AppEnv());
      expect(logger).toBeInstanceOf(BetterstackLogger);
    });

    test("should implement ILogger interface", () => {
      const logger = new BetterstackLogger(new AppEnv());
      expect(typeof logger.init).toBe("function");
      expect(typeof logger.error).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.debug).toBe("function");
      expect(typeof logger.log).toBe("function");
      expect(typeof logger.success).toBe("function");
      expect(typeof logger.flush).toBe("function");
    });

    test("should create Logtail instance with source token", () => {
      expect(() => new BetterstackLogger(new AppEnv())).not.toThrow();
    });

    test("should throw LoggerException when BETTERSTACK_LOGGER_SOURCE_TOKEN is missing", () => {
      delete Bun.env.BETTERSTACK_LOGGER_SOURCE_TOKEN;
      expect(() => new BetterstackLogger(new AppEnv())).toThrow(LoggerException);
      expect(() => new BetterstackLogger(new AppEnv())).toThrow(
        "Logtail source token is required. Please set the BETTERSTACK_LOGGER_SOURCE_TOKEN environment variable.",
      );
    });

    test("should create Logtail instance with custom endpoint when BETTERSTACK_LOGGER_INGESTING_HOST is set", () => {
      Bun.env.BETTERSTACK_LOGGER_INGESTING_HOST = "https://custom-endpoint.example.com";
      expect(() => new BetterstackLogger(new AppEnv())).not.toThrow();
    });
  });

  describe("init", () => {
    test("should be callable without error", () => {
      const logger = new BetterstackLogger(new AppEnv());
      expect(() => logger.init()).not.toThrow();
    });
  });

  describe("error", () => {
    test("should log error with string message", () => {
      const logger = new BetterstackLogger(new AppEnv());

      logger.error("Something went wrong");
      expect(mockError).toHaveBeenCalledWith("Something went wrong", undefined);
    });

    test("should log error with string message and data", () => {
      const logger = new BetterstackLogger(new AppEnv());

      const data = { userId: "user-123" };
      logger.error("Something went wrong", data);
      expect(mockError).toHaveBeenCalledWith("Something went wrong", data);
    });

    test("should log error with exception message", () => {
      const logger = new BetterstackLogger(new AppEnv());

      const mockException: IException = {
        key: crypto.randomUUID(),
        message: "Exception occurred",
        name: "TestException",
        status: 500,
        date: new Date("2026-01-15T10:00:00Z"),
        stackToJson: mock(() => [{ file: "test.ts", line: 42, column: 10, functionName: "testFunc" }]),
        stackToString: mock(() => "Error at test.ts:42:10"),
        toResponse: mock(() => ({ status: 500, body: "Error" })),
      } as unknown as IException;

      logger.error(mockException);
      expect(mockError).toHaveBeenCalledTimes(1);
      expect(mockError.mock.calls[0]?.[0]).toBe("Exception occurred");
    });

    test("should use 'Unknown error' when exception message is undefined", () => {
      const logger = new BetterstackLogger(new AppEnv());

      const mockException: IException = {
        key: crypto.randomUUID(),
        message: undefined,
        name: "NoMessageException",
        status: 500,
        date: new Date(),
        stackToJson: mock(() => null),
        stackToString: mock(() => ""),
        toResponse: mock(() => ({})),
      } as unknown as IException;

      logger.error(mockException);
      expect(mockError.mock.calls[0]?.[0]).toBe("Unknown error");
    });

    test("should include exceptionName in data when exception has name", () => {
      const logger = new BetterstackLogger(new AppEnv());

      const mockException: IException = {
        key: crypto.randomUUID(),
        message: "Error",
        name: "ValidationException",
        status: 422,
        date: new Date(),
        stackToJson: mock(() => null),
        stackToString: mock(() => ""),
        toResponse: mock(() => ({})),
      } as unknown as IException;

      logger.error(mockException);
      const callData = mockError.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(callData?.exceptionName).toBe("ValidationException");
    });

    test("should include status in data when exception has status", () => {
      const logger = new BetterstackLogger(new AppEnv());

      const mockException: IException = {
        key: crypto.randomUUID(),
        message: "Error",
        name: "ServerError",
        status: 503,
        date: new Date(),
        stackToJson: mock(() => null),
        stackToString: mock(() => ""),
        toResponse: mock(() => ({})),
      } as unknown as IException;

      logger.error(mockException);
      const callData = mockError.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(callData?.status).toBe(503);
    });

    test("should include stackTrace in data when exception has stack", () => {
      const logger = new BetterstackLogger(new AppEnv());

      const stackTrace = [{ file: "app.ts", line: 10, column: 5, functionName: "main" }];

      const mockException: IException = {
        key: crypto.randomUUID(),
        message: "Error with stack",
        name: "StackError",
        status: 500,
        date: new Date(),
        stackToJson: mock(() => stackTrace),
        stackToString: mock(() => ""),
        toResponse: mock(() => ({})),
      } as unknown as IException;

      logger.error(mockException);
      const callData = mockError.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(callData?.stackTrace).toBe(JSON.stringify(stackTrace));
    });

    test("should not include stackTrace when stackToJson returns null", () => {
      const logger = new BetterstackLogger(new AppEnv());

      const mockException: IException = {
        key: crypto.randomUUID(),
        message: "Error",
        name: "NoStackError",
        status: 500,
        date: new Date(),
        stackToJson: mock(() => null),
        stackToString: mock(() => ""),
        toResponse: mock(() => ({})),
      } as unknown as IException;

      logger.error(mockException);
      const callData = mockError.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(callData?.stackTrace).toBeUndefined();
    });

    test("should merge data with exception data", () => {
      const logger = new BetterstackLogger(new AppEnv());

      const mockException: IException = {
        key: crypto.randomUUID(),
        message: "Error",
        name: "TestError",
        status: 400,
        date: new Date(),
        stackToJson: mock(() => null),
        stackToString: mock(() => ""),
        toResponse: mock(() => ({})),
      } as unknown as IException;

      logger.error(mockException, { userId: "user-123" });
      const callData = mockError.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(callData?.userId).toBe("user-123");
      expect(callData?.exceptionName).toBe("TestError");
    });
  });

  describe("warn", () => {
    test("should log warning with message", () => {
      const logger = new BetterstackLogger(new AppEnv());

      logger.warn("This is a warning");
      expect(mockWarn).toHaveBeenCalledWith("This is a warning", undefined);
    });

    test("should log warning with message and data", () => {
      const logger = new BetterstackLogger(new AppEnv());

      const data = { disk: "low" };
      logger.warn("Low disk space", data);
      expect(mockWarn).toHaveBeenCalledWith("Low disk space", data);
    });
  });

  describe("info", () => {
    test("should log info with message", () => {
      const logger = new BetterstackLogger(new AppEnv());

      logger.info("User logged in");
      expect(mockInfo).toHaveBeenCalledWith("User logged in", undefined);
    });

    test("should log info with message and data", () => {
      const logger = new BetterstackLogger(new AppEnv());

      const data = { userId: "user-456" };
      logger.info("User logged in", data);
      expect(mockInfo).toHaveBeenCalledWith("User logged in", data);
    });
  });

  describe("debug", () => {
    test("should log debug with message", () => {
      const logger = new BetterstackLogger(new AppEnv());

      logger.debug("Debug output");
      expect(mockDebug).toHaveBeenCalledWith("Debug output", undefined);
    });

    test("should log debug with message and data", () => {
      const logger = new BetterstackLogger(new AppEnv());

      const data = { query: "SELECT *" };
      logger.debug("Query executed", data);
      expect(mockDebug).toHaveBeenCalledWith("Query executed", data);
    });
  });

  describe("log", () => {
    test("should log with LOG level", () => {
      const logger = new BetterstackLogger(new AppEnv());

      logger.log("General log");
      expect(mockInfo).toHaveBeenCalledWith("General log", { level: "LOG" });
    });

    test("should merge data with LOG level", () => {
      const logger = new BetterstackLogger(new AppEnv());

      logger.log("General log", { key: "value" });
      expect(mockInfo).toHaveBeenCalledWith("General log", { key: "value", level: "LOG" });
    });
  });

  describe("success", () => {
    test("should log with SUCCESS level", () => {
      const logger = new BetterstackLogger(new AppEnv());

      logger.success("Operation completed");
      expect(mockInfo).toHaveBeenCalledWith("Operation completed", { level: "SUCCESS" });
    });

    test("should merge data with SUCCESS level", () => {
      const logger = new BetterstackLogger(new AppEnv());

      logger.success("Done", { count: 5 });
      expect(mockInfo).toHaveBeenCalledWith("Done", { count: 5, level: "SUCCESS" });
    });
  });

  describe("flush", () => {
    test("should flush pending logs", async () => {
      const logger = new BetterstackLogger(new AppEnv());

      await logger.flush();
      expect(mockFlush).toHaveBeenCalledTimes(1);
    });
  });
});
