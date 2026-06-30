import { describe, expect, test } from "bun:test";
import { Exception } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";
import { RouterException } from "@/index";

describe("RouterException", () => {
  test("should have correct exception name", () => {
    const exception = new RouterException("Test message", "TEST_KEY");
    expect(exception.name).toBe("RouterException");
  });

  test("should create RouterException with message only", () => {
    const message = "Route not found";
    const exception = new RouterException(message, "ROUTE_NOT_FOUND");

    expect(exception).toBeInstanceOf(RouterException);
    expect(exception).toBeInstanceOf(Exception);
    expect(exception).toBeInstanceOf(Error);
    expect(exception.message).toBe(message);
    expect(exception.key).toBe("ROUTE_NOT_FOUND");
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual({});
  });

  test("should create RouterException with message and data", () => {
    const message = "Invalid route pattern";
    const data = { path: "/users/:id", method: "GET" };
    const exception = new RouterException(message, "INVALID_ROUTE_PATTERN", data);

    expect(exception.message).toBe(message);
    expect(exception.key).toBe("INVALID_ROUTE_PATTERN");
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual(data);
  });

  test("should have immutable data property", () => {
    const data = { key: "value" };
    const exception = new RouterException("Test message", "TEST_KEY", data);

    expect(Object.isFrozen(exception.data)).toBe(true);
    expect(() => {
      exception.data.key = "modified";
    }).toThrow();
  });

  test("should inherit all properties from Exception", () => {
    const message = "Router error";
    const data = { route: "/api/v1" };
    const exception = new RouterException(message, "ROUTER_ERROR", data);

    expect(exception.date).toBeInstanceOf(Date);
    expect(exception.status).toBe(500);
    expect(exception.data).toEqual(data);
    expect(exception.stack).toBeDefined();
  });

  test("should maintain proper stack trace", () => {
    function throwRouterException() {
      throw new RouterException("Stack trace test", "STACK_TRACE_TEST");
    }

    try {
      throwRouterException();
      // biome-ignore lint/suspicious/noExplicitAny: trust me
    } catch (error: any) {
      expect(error).toBeInstanceOf(RouterException);
      expect(error.stack).toContain("throwRouterException");
    }
  });
});
