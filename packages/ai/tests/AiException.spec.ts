import { describe, expect, test } from "bun:test";
import { Exception } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";
import { AiException } from "@/AiException";

describe("AiException", () => {
  test("should have correct exception name", () => {
    const exception = new AiException("Test message", "TEST");
    expect(exception.name).toBe("AiException");
  });

  test("should create AiException with message only", () => {
    const message = "AI request failed";
    const exception = new AiException(message, "REQUEST_FAILED");

    expect(exception).toBeInstanceOf(AiException);
    expect(exception).toBeInstanceOf(Exception);
    expect(exception).toBeInstanceOf(Error);
    expect(exception.message).toBe(message);
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual({});
    expect(exception.key).toBe("REQUEST_FAILED");
  });

  test("should create AiException with message and data", () => {
    const message = "PubMed request failed";
    const data = { status: 500, endpoint: "esearch.fcgi" };
    const exception = new AiException(message, "PUBMED_REQUEST_FAILED", data);

    expect(exception.message).toBe(message);
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual(data);
    expect(exception.key).toBe("PUBMED_REQUEST_FAILED");
  });

  test("should have immutable data property", () => {
    const data = { key: "value" };
    const exception = new AiException("Test message", "TEST", data);

    expect(Object.isFrozen(exception.data)).toBe(true);
    expect(() => {
      exception.data.key = "modified";
    }).toThrow();
  });

  test("should inherit all properties from Exception", () => {
    const message = "AI error";
    const data = { provider: "openrouter" };
    const exception = new AiException(message, "ERROR", data);

    expect(exception.date).toBeInstanceOf(Date);
    expect(exception.status).toBe(500);
    expect(exception.data).toEqual(data);
    expect(exception.stack).toBeDefined();
  });

  test("should maintain proper stack trace", () => {
    function throwAiException() {
      throw new AiException("Stack trace test", "STACK_TRACE_TEST");
    }

    try {
      throwAiException();
      // biome-ignore lint/suspicious/noExplicitAny: trust me
    } catch (error: any) {
      expect(error).toBeInstanceOf(AiException);
      expect(error.stack).toContain("throwAiException");
    }
  });
});
