import { describe, expect, test } from "bun:test";
import { Exception } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";
import { PermissionException } from "@/index";

describe("PermissionException", () => {
  test("should have correct exception name", () => {
    const exception = new PermissionException("Test message", "TEST_KEY");
    expect(exception.name).toBe("PermissionException");
  });

  test("should create PermissionException with message only", () => {
    const message = "Permission denied";
    const exception = new PermissionException(message, "DENIED");

    expect(exception).toBeInstanceOf(PermissionException);
    expect(exception).toBeInstanceOf(Exception);
    expect(exception).toBeInstanceOf(Error);
    expect(exception.message).toBe(message);
    expect(exception.key).toBe("DENIED");
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual({});
  });

  test("should create PermissionException with message and data", () => {
    const message = "Access forbidden";
    const data = { resource: "admin-panel", action: "write" };
    const exception = new PermissionException(message, "ACCESS_FORBIDDEN", data);

    expect(exception.message).toBe(message);
    expect(exception.key).toBe("ACCESS_FORBIDDEN");
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual(data);
  });

  test("should have immutable data property", () => {
    const data = { key: "value" };
    const exception = new PermissionException("Test message", "TEST_KEY", data);

    expect(Object.isFrozen(exception.data)).toBe(true);
    expect(() => {
      exception.data.key = "modified";
    }).toThrow();
  });

  test("should inherit all properties from Exception", () => {
    const message = "Permission error";
    const data = { role: "user" };
    const exception = new PermissionException(message, "ERROR", data);

    expect(exception.date).toBeInstanceOf(Date);
    expect(exception.status).toBe(500);
    expect(exception.data).toEqual(data);
    expect(exception.stack).toBeDefined();
  });

  test("should maintain proper stack trace", () => {
    function throwPermissionException() {
      throw new PermissionException("Stack trace test", "STACK_TRACE_TEST");
    }

    try {
      throwPermissionException();
      // biome-ignore lint/suspicious/noExplicitAny: trust me
    } catch (error: any) {
      expect(error).toBeInstanceOf(PermissionException);
      expect(error.stack).toContain("throwPermissionException");
    }
  });
});
