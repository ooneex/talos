import { describe, expect, test } from "bun:test";
import { Exception } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";
import { JwtException } from "@/index";

describe("JwtException", () => {
  test("should have correct exception name", () => {
    const exception = new JwtException("Test message", "TEST_NAME");
    expect(exception.name).toBe("JwtException");
  });

  test("should create JwtException with message only", () => {
    const message = "JWT verification failed";
    const exception = new JwtException(message, "JWT_VERIFY_FAILED");

    expect(exception).toBeInstanceOf(JwtException);
    expect(exception).toBeInstanceOf(Exception);
    expect(exception).toBeInstanceOf(Error);
    expect(exception.message).toBe(message);
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual({});
    expect(exception.key).toBe("JWT_VERIFY_FAILED");
  });

  test("should create JwtException with message and data", () => {
    const message = "Token expired";
    const data = { algorithm: "HS256", tokenExpired: true };
    const exception = new JwtException(message, "JWT_TOKEN_EXPIRED", data);

    expect(exception.message).toBe(message);
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual(data);
    expect(exception.key).toBe("JWT_TOKEN_EXPIRED");
  });

  test("should have immutable data property", () => {
    const data = { key: "value" };
    const exception = new JwtException("Test message", "TEST_IMMUTABLE", data);

    expect(Object.isFrozen(exception.data)).toBe(true);
    expect(() => {
      exception.data.key = "modified";
    }).toThrow();
  });

  test("should inherit all properties from Exception", () => {
    const message = "JWT error";
    const data = { issuer: "auth-service" };
    const exception = new JwtException(message, "JWT_ERROR", data);

    expect(exception.date).toBeInstanceOf(Date);
    expect(exception.status).toBe(500);
    expect(exception.data).toEqual(data);
    expect(exception.stack).toBeDefined();
  });

  test("should maintain proper stack trace", () => {
    function throwJwtException() {
      throw new JwtException("Stack trace test", "JWT_STACK_TRACE");
    }

    try {
      throwJwtException();
      // biome-ignore lint/suspicious/noExplicitAny: trust me
    } catch (error: any) {
      expect(error).toBeInstanceOf(JwtException);
      expect(error.stack).toContain("throwJwtException");
    }
  });
});
