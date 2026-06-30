import { describe, expect, test } from "bun:test";
import { Exception } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";
import { LoggerException } from "../src";

describe("LoggerException", () => {
  test("should have correct exception name", () => {
    const exception = new LoggerException("Test message", "TEST_NAME");
    expect(exception.name).toBe("LoggerException");
  });

  test("should create LoggerException with message only", () => {
    const message = "Logger initialization failed";
    const exception = new LoggerException(message, "LOGGER_INIT_FAILED");

    expect(exception).toBeInstanceOf(LoggerException);
    expect(exception).toBeInstanceOf(Exception);
    expect(exception).toBeInstanceOf(Error);
    expect(exception.message).toBe(message);
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual({});
    expect(exception.key).toBe("LOGGER_INIT_FAILED");
  });

  test("should create LoggerException with message and data", () => {
    const message = "Log write failed";
    const data = { logger: "DatabaseLogger", reason: "Connection timeout" };
    const exception = new LoggerException(message, "LOG_WRITE_FAILED", data);

    expect(exception.message).toBe(message);
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual(data);
    expect(exception.key).toBe("LOG_WRITE_FAILED");
  });

  test("should have immutable data property", () => {
    const data = { key: "value" };
    const exception = new LoggerException("Test message", "TEST_IMMUTABLE", data);

    expect(Object.isFrozen(exception.data)).toBe(true);
    expect(() => {
      exception.data.key = "modified";
    }).toThrow();
  });

  test("should inherit all properties from Exception", () => {
    const message = "Logger error";
    const data = { transport: "logtail" };
    const exception = new LoggerException(message, "LOGGER_ERROR", data);

    expect(exception.date).toBeInstanceOf(Date);
    expect(exception.status).toBe(500);
    expect(exception.data).toEqual(data);
    expect(exception.stack).toBeDefined();
  });

  test("should maintain proper stack trace", () => {
    function throwLoggerException() {
      throw new LoggerException("Stack trace test", "LOGGER_STACK_TRACE");
    }

    try {
      throwLoggerException();
      // biome-ignore lint/suspicious/noExplicitAny: trust me
    } catch (error: any) {
      expect(error).toBeInstanceOf(LoggerException);
      expect(error.stack).toContain("throwLoggerException");
    }
  });
});
