import { describe, expect, test } from "bun:test";
import { Exception } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";
import { RAGException } from "@/index";

describe("RAGException", () => {
  test("should have correct exception name", () => {
    const exception = new RAGException("Test message", "TEST_KEY");
    expect(exception.name).toBe("RAGException");
  });

  test("should create RAGException with message only", () => {
    const message = "OCR failed";
    const exception = new RAGException(message, "OCR_FAILED");

    expect(exception).toBeInstanceOf(RAGException);
    expect(exception).toBeInstanceOf(Exception);
    expect(exception).toBeInstanceOf(Error);
    expect(exception.message).toBe(message);
    expect(exception.key).toBe("OCR_FAILED");
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual({});
  });

  test("should create RAGException with message and data", () => {
    const message = "Failed to OCR scanned PDF pages";
    const data = { source: "document.pdf", pages: [2] };
    const exception = new RAGException(message, "OCR_FAILED", data);

    expect(exception.message).toBe(message);
    expect(exception.key).toBe("OCR_FAILED");
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual(data);
  });

  test("should have immutable data property", () => {
    const data = { key: "value" };
    const exception = new RAGException("Test message", "TEST_KEY", data);

    expect(Object.isFrozen(exception.data)).toBe(true);
    expect(() => {
      exception.data.key = "modified";
    }).toThrow();
  });
});
