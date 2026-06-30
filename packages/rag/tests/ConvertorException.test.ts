import { describe, expect, test } from "bun:test";
import { Exception } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";
import { ConvertorException } from "@/index";

describe("ConvertorException", () => {
  test("should have correct exception name", () => {
    const exception = new ConvertorException("Test message", "TEST_KEY");
    expect(exception.name).toBe("ConvertorException");
  });

  test("should create ConvertorException with message only", () => {
    const message = "Conversion failed";
    const exception = new ConvertorException(message, "CONVERSION_FAILED");

    expect(exception).toBeInstanceOf(ConvertorException);
    expect(exception).toBeInstanceOf(Exception);
    expect(exception).toBeInstanceOf(Error);
    expect(exception.message).toBe(message);
    expect(exception.key).toBe("CONVERSION_FAILED");
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual({});
  });

  test("should create ConvertorException with message and data", () => {
    const message = "PDF conversion failed";
    const data = { file: "document.pdf", page: 3 };
    const exception = new ConvertorException(message, "PDF_FAILED", data);

    expect(exception.message).toBe(message);
    expect(exception.key).toBe("PDF_FAILED");
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual(data);
  });

  test("should have immutable data property", () => {
    const data = { key: "value" };
    const exception = new ConvertorException("Test message", "TEST_KEY", data);

    expect(Object.isFrozen(exception.data)).toBe(true);
    expect(() => {
      exception.data.key = "modified";
    }).toThrow();
  });

  test("should inherit all properties from Exception", () => {
    const message = "Convertor error";
    const data = { format: "pdf" };
    const exception = new ConvertorException(message, "ERROR", data);

    expect(exception.date).toBeInstanceOf(Date);
    expect(exception.status).toBe(500);
    expect(exception.data).toEqual(data);
    expect(exception.stack).toBeDefined();
  });

  test("should maintain proper stack trace", () => {
    function throwConvertorException() {
      throw new ConvertorException("Stack trace test", "STACK_TRACE_TEST");
    }

    try {
      throwConvertorException();
      // biome-ignore lint/suspicious/noExplicitAny: trust me
    } catch (error: any) {
      expect(error).toBeInstanceOf(ConvertorException);
      expect(error.stack).toContain("throwConvertorException");
    }
  });
});
