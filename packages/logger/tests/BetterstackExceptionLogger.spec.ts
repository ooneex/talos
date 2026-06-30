import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@talosjs/app-env";
import type { IException } from "@talosjs/exception";
import { BetterstackExceptionLogger } from "@/BetterstackExceptionLogger";
import { LoggerException } from "@/LoggerException";

const mockInit = mock((_options: Record<string, unknown>) => {});
const mockWithScope = mock((callback: (scope: Record<string, unknown>) => void) => {
  const scope = {
    setExtras: mockSetExtras,
    addBreadcrumb: mockAddBreadcrumb,
    setTag: mockSetTag,
    setContext: mockSetContext,
  };
  callback(scope);
});
const mockCaptureException = mock((_error: unknown) => "event-id");
const mockFlush = mock((_timeout?: number) => Promise.resolve(true));
const mockSetExtras = mock((_extras: Record<string, unknown>) => {});
const mockAddBreadcrumb = mock((_breadcrumb: Record<string, unknown>) => {});
const mockSetTag = mock((_key: string, _value: string | number) => {});
const mockSetContext = mock((_name: string, _context: Record<string, unknown>) => {});
const mockLoggerWarn = mock((_message: string, _data?: Record<string, unknown>) => {});
const mockLoggerInfo = mock((_message: string, _data?: Record<string, unknown>) => {});
const mockLoggerDebug = mock((_message: string, _data?: Record<string, unknown>) => {});

mock.module("@sentry/node", () => ({
  init: mockInit,
  withScope: mockWithScope,
  captureException: mockCaptureException,
  flush: mockFlush,
  logger: {
    warn: mockLoggerWarn,
    info: mockLoggerInfo,
    debug: mockLoggerDebug,
  },
}));

describe("BetterstackExceptionLogger", () => {
  beforeEach(() => {
    mockInit.mockClear();
    mockWithScope.mockClear();
    mockCaptureException.mockClear();
    mockFlush.mockClear();
    mockSetExtras.mockClear();
    mockAddBreadcrumb.mockClear();
    mockSetTag.mockClear();
    mockSetContext.mockClear();
    mockLoggerWarn.mockClear();
    mockLoggerInfo.mockClear();
    mockLoggerDebug.mockClear();
    Bun.env.BETTERSTACK_EXCEPTION_LOGGER_APPLICATION_TOKEN = "test-app-token";
    Bun.env.BETTERSTACK_EXCEPTION_LOGGER_INGESTING_HOST = "test-host.example.com";
  });

  describe("constructor", () => {
    test("should create an instance of BetterstackExceptionLogger", () => {
      const logger = new BetterstackExceptionLogger(new AppEnv());
      expect(logger).toBeInstanceOf(BetterstackExceptionLogger);
    });

    test("should implement ILogger interface", () => {
      const logger = new BetterstackExceptionLogger(new AppEnv());
      expect(typeof logger.init).toBe("function");
      expect(typeof logger.error).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.debug).toBe("function");
      expect(typeof logger.log).toBe("function");
      expect(typeof logger.success).toBe("function");
      expect(typeof logger.flush).toBe("function");
    });

    test("should initialize Sentry with correct DSN", () => {
      new BetterstackExceptionLogger(new AppEnv());
      expect(mockInit).toHaveBeenCalledWith({
        dsn: "https://test-app-token@test-host.example.com/1",
        tracesSampleRate: 1.0,
        enableLogs: true,
      });
    });

    test("should throw LoggerException when BETTERSTACK_EXCEPTION_LOGGER_APPLICATION_TOKEN is missing", () => {
      delete Bun.env.BETTERSTACK_EXCEPTION_LOGGER_APPLICATION_TOKEN;
      expect(() => new BetterstackExceptionLogger(new AppEnv())).toThrow(LoggerException);
      expect(() => new BetterstackExceptionLogger(new AppEnv())).toThrow(
        "Better Stack application token is required. Please set the BETTERSTACK_EXCEPTION_LOGGER_APPLICATION_TOKEN environment variable.",
      );
    });

    test("should throw LoggerException when BETTERSTACK_EXCEPTION_LOGGER_INGESTING_HOST is missing", () => {
      delete Bun.env.BETTERSTACK_EXCEPTION_LOGGER_INGESTING_HOST;
      expect(() => new BetterstackExceptionLogger(new AppEnv())).toThrow(LoggerException);
      expect(() => new BetterstackExceptionLogger(new AppEnv())).toThrow(
        "Better Stack ingesting host is required. Please set the BETTERSTACK_EXCEPTION_LOGGER_INGESTING_HOST environment variable.",
      );
    });
  });

  describe("init", () => {
    test("should be callable without error", () => {
      const logger = new BetterstackExceptionLogger(new AppEnv());
      expect(() => logger.init()).not.toThrow();
    });
  });

  describe("error", () => {
    test("should log error with string message", () => {
      const logger = new BetterstackExceptionLogger(new AppEnv());

      logger.error("Something went wrong");
      expect(mockWithScope).toHaveBeenCalledTimes(1);
      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      const capturedError = mockCaptureException.mock.calls[0]?.[0] as Error;
      expect(capturedError).toBeInstanceOf(Error);
      expect(capturedError.message).toBe("Something went wrong");
    });

    test("should add error breadcrumb for string message", () => {
      const logger = new BetterstackExceptionLogger(new AppEnv());

      logger.error("Something went wrong");
      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: "error",
        message: "Something went wrong",
        level: "error",
      });
    });

    test("should set extras for string message with data", () => {
      const logger = new BetterstackExceptionLogger(new AppEnv());

      const data = { userId: "user-123" };
      logger.error("Something went wrong", data);
      expect(mockSetExtras).toHaveBeenCalledWith(data);
    });

    test("should not set extras for string message without data", () => {
      const logger = new BetterstackExceptionLogger(new AppEnv());

      logger.error("Something went wrong");
      expect(mockSetExtras).not.toHaveBeenCalled();
    });

    test("should log error with exception message", () => {
      const logger = new BetterstackExceptionLogger(new AppEnv());

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
      expect(mockCaptureException).toHaveBeenCalledWith(mockException);
    });

    test("should set tags for exception", () => {
      const logger = new BetterstackExceptionLogger(new AppEnv());

      const mockException: IException = {
        key: crypto.randomUUID(),
        message: "Exception occurred",
        name: "TestException",
        status: 500,
        date: new Date("2026-01-15T10:00:00Z"),
        stackToJson: mock(() => []),
        stackToString: mock(() => ""),
        toResponse: mock(() => ({})),
      } as unknown as IException;

      logger.error(mockException);
      expect(mockSetTag).toHaveBeenCalledWith("exception.name", "TestException");
      expect(mockSetTag).toHaveBeenCalledWith("exception.status", 500);
    });

    test("should set context for exception", () => {
      const logger = new BetterstackExceptionLogger(new AppEnv());

      const date = new Date("2026-01-15T10:00:00Z");
      const stack = [{ file: "test.ts", line: 42, column: 10, functionName: "testFunc" }];
      const mockException: IException = {
        key: crypto.randomUUID(),
        message: "Exception occurred",
        name: "TestException",
        status: 500,
        date,
        stackToJson: mock(() => stack),
        stackToString: mock(() => ""),
        toResponse: mock(() => ({})),
      } as unknown as IException;

      logger.error(mockException);
      expect(mockSetContext).toHaveBeenCalledWith("exception", {
        name: "TestException",
        status: 500,
        date: date.toISOString(),
        stack,
      });
    });

    test("should add exception breadcrumb", () => {
      const logger = new BetterstackExceptionLogger(new AppEnv());

      const mockException: IException = {
        key: crypto.randomUUID(),
        message: "Exception occurred",
        name: "TestException",
        status: 500,
        date: new Date(),
        stackToJson: mock(() => []),
        stackToString: mock(() => ""),
        toResponse: mock(() => ({})),
      } as unknown as IException;

      logger.error(mockException);
      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: "exception",
        message: "Exception occurred",
        level: "error",
        data: {
          name: "TestException",
          status: 500,
        },
      });
    });

    test("should use 'Unknown error' when exception message is undefined", () => {
      const logger = new BetterstackExceptionLogger(new AppEnv());

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
      expect(mockAddBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({ message: "Unknown error" }));
    });

    test("should set extras for exception with data", () => {
      const logger = new BetterstackExceptionLogger(new AppEnv());

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

      const data = { userId: "user-123" };
      logger.error(mockException, data);
      expect(mockSetExtras).toHaveBeenCalledWith(data);
    });

    test("should not set extras for exception without data", () => {
      const logger = new BetterstackExceptionLogger(new AppEnv());

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

      logger.error(mockException);
      expect(mockSetExtras).not.toHaveBeenCalled();
    });
  });

  describe("warn", () => {
    test("should log warning with message", () => {
      const logger = new BetterstackExceptionLogger(new AppEnv());

      logger.warn("This is a warning");
      expect(mockLoggerWarn).toHaveBeenCalledWith("This is a warning", undefined);
    });

    test("should log warning with message and data", () => {
      const logger = new BetterstackExceptionLogger(new AppEnv());

      const data = { disk: "low" };
      logger.warn("Low disk space", data);
      expect(mockLoggerWarn).toHaveBeenCalledWith("Low disk space", data);
    });
  });

  describe("info", () => {
    test("should log info with message", () => {
      const logger = new BetterstackExceptionLogger(new AppEnv());

      logger.info("User logged in");
      expect(mockLoggerInfo).toHaveBeenCalledWith("User logged in", undefined);
    });

    test("should log info with message and data", () => {
      const logger = new BetterstackExceptionLogger(new AppEnv());

      const data = { userId: "user-456" };
      logger.info("User logged in", data);
      expect(mockLoggerInfo).toHaveBeenCalledWith("User logged in", data);
    });
  });

  describe("debug", () => {
    test("should log debug with message", () => {
      const logger = new BetterstackExceptionLogger(new AppEnv());

      logger.debug("Debug output");
      expect(mockLoggerDebug).toHaveBeenCalledWith("Debug output", undefined);
    });

    test("should log debug with message and data", () => {
      const logger = new BetterstackExceptionLogger(new AppEnv());

      const data = { query: "SELECT *" };
      logger.debug("Query executed", data);
      expect(mockLoggerDebug).toHaveBeenCalledWith("Query executed", data);
    });
  });

  describe("log", () => {
    test("should log with LOG level", () => {
      const logger = new BetterstackExceptionLogger(new AppEnv());

      logger.log("General log");
      expect(mockLoggerInfo).toHaveBeenCalledWith("General log", { level: "LOG" });
    });

    test("should merge data with LOG level", () => {
      const logger = new BetterstackExceptionLogger(new AppEnv());

      logger.log("General log", { key: "value" });
      expect(mockLoggerInfo).toHaveBeenCalledWith("General log", { key: "value", level: "LOG" });
    });
  });

  describe("success", () => {
    test("should log with SUCCESS level", () => {
      const logger = new BetterstackExceptionLogger(new AppEnv());

      logger.success("Operation completed");
      expect(mockLoggerInfo).toHaveBeenCalledWith("Operation completed", { level: "SUCCESS" });
    });

    test("should merge data with SUCCESS level", () => {
      const logger = new BetterstackExceptionLogger(new AppEnv());

      logger.success("Done", { count: 5 });
      expect(mockLoggerInfo).toHaveBeenCalledWith("Done", { count: 5, level: "SUCCESS" });
    });
  });

  describe("flush", () => {
    test("should flush pending logs with timeout", async () => {
      const logger = new BetterstackExceptionLogger(new AppEnv());

      await logger.flush();
      expect(mockFlush).toHaveBeenCalledWith(2000);
    });
  });
});
