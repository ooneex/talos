import { describe, expect, test } from "bun:test";
import { Exception } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";
import { AppEnvException } from "@/index";

describe("AppEnvException", () => {
  test("should have correct exception name", () => {
    const exception = new AppEnvException("Test message", "TEST");
    expect(exception.name).toBe("AppEnvException");
  });

  test("should create AppEnvException with message only", () => {
    const message = "App environment loading failed";
    const exception = new AppEnvException(message, "APP_ENV_LOADING_FAILED");

    expect(exception).toBeInstanceOf(AppEnvException);
    expect(exception).toBeInstanceOf(Exception);
    expect(exception).toBeInstanceOf(Error);
    expect(exception.message).toBe(message);
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual({});
    expect(exception.key).toBe("APP_ENV_LOADING_FAILED");
  });

  test("should create AppEnvException with message and data", () => {
    const message = "Environment variable missing";
    const data = { variable: "DATABASE_URL", required: true };
    const exception = new AppEnvException(message, "ENV_VARIABLE_MISSING", data);

    expect(exception.message).toBe(message);
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual(data);
    expect(exception.key).toBe("ENV_VARIABLE_MISSING");
  });

  test("should have immutable data property", () => {
    const data = { key: "value" };
    const exception = new AppEnvException("Test message", "TEST", data);

    expect(Object.isFrozen(exception.data)).toBe(true);
    expect(() => {
      exception.data.key = "modified";
    }).toThrow();
  });

  test("should inherit all properties from Exception", () => {
    const message = "AppEnv error";
    const data = { environment: "production" };
    const exception = new AppEnvException(message, "APP_ENV_ERROR", data);

    expect(exception.date).toBeInstanceOf(Date);
    expect(exception.status).toBe(500);
    expect(exception.data).toEqual(data);
    expect(exception.stack).toBeDefined();
  });

  test("should maintain proper stack trace", () => {
    function throwAppEnvException() {
      throw new AppEnvException("Stack trace test", "STACK_TRACE_TEST");
    }

    try {
      throwAppEnvException();
      // biome-ignore lint/suspicious/noExplicitAny: trust me
    } catch (error: any) {
      expect(error).toBeInstanceOf(AppEnvException);
      expect(error.stack).toContain("throwAppEnvException");
    }
  });
});
