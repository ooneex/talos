import { describe, expect, test } from "bun:test";
import { Exception } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";
import { ContainerException } from "@/index";

describe("ContainerException", () => {
  test("should have correct exception name", () => {
    const exception = new ContainerException("Test message", "ALIAS_RESOLVE_FAILED");
    expect(exception.name).toBe("ContainerException");
  });

  test("should create ContainerException with message only", () => {
    const message = "Container resolution failed";
    const exception = new ContainerException(message, "SERVICE_RESOLVE_FAILED");

    expect(exception).toBeInstanceOf(ContainerException);
    expect(exception).toBeInstanceOf(Exception);
    expect(exception).toBeInstanceOf(Error);
    expect(exception.message).toBe(message);
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual({});
    expect(exception.key).toBe("SERVICE_RESOLVE_FAILED");
  });

  test("should create ContainerException with message and data", () => {
    const message = "Service not found";
    const data = { serviceId: "UserService", reason: "Not registered" };
    const exception = new ContainerException(message, "SERVICE_RESOLVE_FAILED", data);

    expect(exception.message).toBe(message);
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual(data);
    expect(exception.key).toBe("SERVICE_RESOLVE_FAILED");
  });

  test("should have immutable data property", () => {
    const data = { key: "value" };
    const exception = new ContainerException("Test message", "ALIAS_RESOLVE_FAILED", data);

    expect(Object.isFrozen(exception.data)).toBe(true);
    expect(() => {
      exception.data.key = "modified";
    }).toThrow();
  });

  test("should inherit all properties from Exception", () => {
    const message = "Container error";
    const data = { container: "main" };
    const exception = new ContainerException(message, "CONSTANT_RESOLVE_FAILED", data);

    expect(exception.date).toBeInstanceOf(Date);
    expect(exception.status).toBe(500);
    expect(exception.data).toEqual(data);
    expect(exception.stack).toBeDefined();
  });

  test("should maintain proper stack trace", () => {
    function throwContainerException() {
      throw new ContainerException("Stack trace test", "SERVICE_RESOLVE_FAILED");
    }

    try {
      throwContainerException();
      // biome-ignore lint/suspicious/noExplicitAny: trust me
    } catch (error: any) {
      expect(error).toBeInstanceOf(ContainerException);
      expect(error.stack).toContain("throwContainerException");
    }
  });
});
