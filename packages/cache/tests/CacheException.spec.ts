import { describe, expect, test } from "bun:test";
import { Exception } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";
import { CacheException } from "@/index";

describe("CacheException", () => {
  test("should have correct exception name", () => {
    const exception = new CacheException("Test message", "TEST");
    expect(exception.name).toBe("CacheException");
  });

  test("should create CacheException with message only", () => {
    const message = "Cache operation failed";
    const exception = new CacheException(message, "OPERATION_FAILED");

    expect(exception).toBeInstanceOf(CacheException);
    expect(exception).toBeInstanceOf(Exception);
    expect(exception).toBeInstanceOf(Error);
    expect(exception.message).toBe(message);
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual({});
    expect(exception.key).toBe("OPERATION_FAILED");
  });

  test("should create CacheException with message and data", () => {
    const message = "Cache miss";
    const data = { key: "user:123", store: "redis" };
    const exception = new CacheException(message, "MISS", data);

    expect(exception.message).toBe(message);
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual(data);
    expect(exception.key).toBe("MISS");
  });

  test("should have immutable data property", () => {
    const data = { key: "value" };
    const exception = new CacheException("Test message", "TEST", data);

    expect(Object.isFrozen(exception.data)).toBe(true);
    expect(() => {
      exception.data.key = "modified";
    }).toThrow();
  });

  test("should inherit all properties from Exception", () => {
    const message = "Cache error";
    const data = { store: "memory" };
    const exception = new CacheException(message, "TEST", data);

    expect(exception.date).toBeInstanceOf(Date);
    expect(exception.status).toBe(500);
    expect(exception.data).toEqual(data);
    expect(exception.stack).toBeDefined();
  });

  test("should maintain proper stack trace", () => {
    function throwCacheException() {
      throw new CacheException("Stack trace test", "TEST");
    }

    try {
      throwCacheException();
      // biome-ignore lint/suspicious/noExplicitAny: trust me
    } catch (error: any) {
      expect(error).toBeInstanceOf(CacheException);
      expect(error.stack).toContain("throwCacheException");
    }
  });
});
