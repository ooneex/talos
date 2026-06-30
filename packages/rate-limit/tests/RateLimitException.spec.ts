import { describe, expect, test } from "bun:test";
import { Exception } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";
import { RateLimitException } from "@/index";

describe("RateLimitException", () => {
  test("should have correct exception name", () => {
    const exception = new RateLimitException("Test message", "TEST_KEY");
    expect(exception.name).toBe("RateLimitException");
  });

  test("should create RateLimitException with message only", () => {
    const message = "Rate limit exceeded";
    const exception = new RateLimitException(message, "RATE_LIMIT_EXCEEDED");

    expect(exception).toBeInstanceOf(RateLimitException);
    expect(exception).toBeInstanceOf(Exception);
    expect(exception).toBeInstanceOf(Error);
    expect(exception.message).toBe(message);
    expect(exception.key).toBe("RATE_LIMIT_EXCEEDED");
    expect(exception.status).toBe(HttpStatus.Code.TooManyRequests);
    expect(exception.data).toEqual({});
  });

  test("should create RateLimitException with message and data", () => {
    const message = "Too many requests";
    const data = { key: "user:123", limit: 100, remaining: 0 };
    const exception = new RateLimitException(message, "RATE_LIMIT_TOO_MANY_REQUESTS", data);

    expect(exception.message).toBe(message);
    expect(exception.key).toBe("RATE_LIMIT_TOO_MANY_REQUESTS");
    expect(exception.status).toBe(HttpStatus.Code.TooManyRequests);
    expect(exception.data).toEqual(data);
  });

  test("should have immutable data property", () => {
    const data = { key: "value" };
    const exception = new RateLimitException("Test message", "TEST_KEY", data);

    expect(Object.isFrozen(exception.data)).toBe(true);
    expect(() => {
      exception.data.key = "modified";
    }).toThrow();
  });

  test("should inherit all properties from Exception", () => {
    const message = "Rate limit error";
    const data = { ip: "192.168.1.1" };
    const exception = new RateLimitException(message, "RATE_LIMIT_ERROR", data);

    expect(exception.date).toBeInstanceOf(Date);
    expect(exception.status).toBe(429);
    expect(exception.data).toEqual(data);
    expect(exception.stack).toBeDefined();
  });

  test("should maintain proper stack trace", () => {
    function throwRateLimitException() {
      throw new RateLimitException("Stack trace test", "STACK_TRACE_TEST");
    }

    try {
      throwRateLimitException();
      // biome-ignore lint/suspicious/noExplicitAny: trust me
    } catch (error: any) {
      expect(error).toBeInstanceOf(RateLimitException);
      expect(error.stack).toContain("throwRateLimitException");
    }
  });

  test("should use HTTP 429 Too Many Requests status code", () => {
    const exception = new RateLimitException("Rate limited", "RATE_LIMITED");
    expect(exception.status).toBe(429);
    expect(exception.status).toBe(HttpStatus.Code.TooManyRequests);
  });
});
