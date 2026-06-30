import { describe, expect, test } from "bun:test";
import { Exception } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";
import { YoutubeException } from "@/index";

describe("YoutubeException", () => {
  test("should have correct exception name", () => {
    const exception = new YoutubeException("Test message", "TEST_KEY");
    expect(exception.name).toBe("YoutubeException");
  });

  test("should create YoutubeException with message only", () => {
    const message = "Youtube processing failed";
    const exception = new YoutubeException(message, "PROCESSING_FAILED");

    expect(exception).toBeInstanceOf(YoutubeException);
    expect(exception).toBeInstanceOf(Exception);
    expect(exception).toBeInstanceOf(Error);
    expect(exception.message).toBe(message);
    expect(exception.key).toBe("PROCESSING_FAILED");
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual({});
  });

  test("should create YoutubeException with message and data", () => {
    const message = "Video fetch failed";
    const data = { videoId: "abc123", reason: "not found" };
    const exception = new YoutubeException(message, "VIDEO_FETCH_FAILED", data);

    expect(exception.message).toBe(message);
    expect(exception.key).toBe("VIDEO_FETCH_FAILED");
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual(data);
  });

  test("should have immutable data property", () => {
    const data = { key: "value" };
    const exception = new YoutubeException("Test message", "TEST_KEY", data);

    expect(Object.isFrozen(exception.data)).toBe(true);
    expect(() => {
      exception.data.key = "modified";
    }).toThrow();
  });

  test("should inherit all properties from Exception", () => {
    const message = "Youtube error";
    const data = { channel: "test-channel" };
    const exception = new YoutubeException(message, "ERROR", data);

    expect(exception.date).toBeInstanceOf(Date);
    expect(exception.status).toBe(500);
    expect(exception.data).toEqual(data);
    expect(exception.stack).toBeDefined();
  });

  test("should maintain proper stack trace", () => {
    function throwYoutubeException() {
      throw new YoutubeException("Stack trace test", "STACK_TRACE_TEST");
    }

    try {
      throwYoutubeException();
      // biome-ignore lint/suspicious/noExplicitAny: trust me
    } catch (error: any) {
      expect(error).toBeInstanceOf(YoutubeException);
      expect(error.stack).toContain("throwYoutubeException");
    }
  });
});
