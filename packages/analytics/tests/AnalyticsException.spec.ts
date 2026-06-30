import { describe, expect, test } from "bun:test";
import { Exception } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";
import { AnalyticsException } from "@/AnalyticsException";

describe("AnalyticsException", () => {
  test("should have correct exception name", () => {
    const exception = new AnalyticsException("Test message", "TEST");
    expect(exception.name).toBe("AnalyticsException");
  });

  test("should create AnalyticsException with message only", () => {
    const message = "Analytics tracking failed";
    const exception = new AnalyticsException(message, "TRACKING_FAILED");

    expect(exception).toBeInstanceOf(AnalyticsException);
    expect(exception).toBeInstanceOf(Exception);
    expect(exception).toBeInstanceOf(Error);
    expect(exception.message).toBe(message);
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual({});
    expect(exception.key).toBe("TRACKING_FAILED");
  });

  test("should create AnalyticsException with message and data", () => {
    const message = "Event processing failed";
    const data = { eventType: "user_action", userId: "12345" };
    const exception = new AnalyticsException(message, "EVENT_PROCESSING_FAILED", data);

    expect(exception.message).toBe(message);
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual(data);
    expect(exception.key).toBe("EVENT_PROCESSING_FAILED");
  });

  test("should have immutable data property", () => {
    const data = { key: "value" };
    const exception = new AnalyticsException("Test message", "TEST", data);

    expect(Object.isFrozen(exception.data)).toBe(true);
    expect(() => {
      exception.data.key = "modified";
    }).toThrow();
  });

  test("should inherit all properties from Exception", () => {
    const message = "Analytics error";
    const data = { provider: "google_analytics" };
    const exception = new AnalyticsException(message, "ERROR", data);

    expect(exception.date).toBeInstanceOf(Date);
    expect(exception.status).toBe(500);
    expect(exception.data).toEqual(data);
    expect(exception.stack).toBeDefined();
  });

  test("should maintain proper stack trace", () => {
    function throwAnalyticsException() {
      throw new AnalyticsException("Stack trace test", "STACK_TRACE_TEST");
    }

    try {
      throwAnalyticsException();
      // biome-ignore lint/suspicious/noExplicitAny: trust me
    } catch (error: any) {
      expect(error).toBeInstanceOf(AnalyticsException);
      expect(error.stack).toContain("throwAnalyticsException");
    }
  });
});
