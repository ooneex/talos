import { describe, expect, test } from "bun:test";
import { Exception } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";
import { TranslationException } from "@/index";

describe("TranslationException", () => {
  test("should have correct exception name", () => {
    const exception = new TranslationException("Test message", "TEST_KEY");
    expect(exception.name).toBe("TranslationException");
  });

  test("should create TranslationException with message only", () => {
    const message = "Translation key not found";
    const exception = new TranslationException(message, "TRANSLATION_KEY_NOT_FOUND");

    expect(exception).toBeInstanceOf(TranslationException);
    expect(exception).toBeInstanceOf(Exception);
    expect(exception).toBeInstanceOf(Error);
    expect(exception.message).toBe(message);
    expect(exception.key).toBe("TRANSLATION_KEY_NOT_FOUND");
    expect(exception.status).toBe(HttpStatus.Code.NotFound);
    expect(exception.data).toEqual({});
  });

  test("should create TranslationException with message and data", () => {
    const message = "Translation missing for locale";
    const data = { key: "common.buttons.submit", locale: "fr" };
    const exception = new TranslationException(message, "TRANSLATION_MISSING", data);

    expect(exception.message).toBe(message);
    expect(exception.key).toBe("TRANSLATION_MISSING");
    expect(exception.status).toBe(HttpStatus.Code.NotFound);
    expect(exception.data).toEqual(data);
  });

  test("should have immutable data property", () => {
    const data = { key: "value" };
    const exception = new TranslationException("Test message", "TEST_KEY", data);

    expect(Object.isFrozen(exception.data)).toBe(true);
    expect(() => {
      exception.data.key = "modified";
    }).toThrow();
  });

  test("should inherit all properties from Exception", () => {
    const message = "Translation error";
    const data = { locale: "en" };
    const exception = new TranslationException(message, "TRANSLATION_ERROR", data);

    expect(exception.date).toBeInstanceOf(Date);
    expect(exception.status).toBe(404);
    expect(exception.data).toEqual(data);
    expect(exception.stack).toBeDefined();
  });

  test("should maintain proper stack trace", () => {
    function throwTranslationException() {
      throw new TranslationException("Stack trace test", "STACK_TRACE_TEST");
    }

    try {
      throwTranslationException();
      // biome-ignore lint/suspicious/noExplicitAny: trust me
    } catch (error: any) {
      expect(error).toBeInstanceOf(TranslationException);
      expect(error.stack).toContain("throwTranslationException");
    }
  });
});
