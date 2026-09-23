import { describe, expect, test } from "bun:test";
import { Exception } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";
import { MarkdownException } from "@/index";

describe("MarkdownException", () => {
  test("should have correct exception name", () => {
    const exception = new MarkdownException("Test message", "TEST_NAME");
    expect(exception.name).toBe("MarkdownException");
  });

  test("should create MarkdownException with message only", () => {
    const exception = new MarkdownException("Markdown parsing failed", "MARKDOWN_PARSE_FAILED");

    expect(exception).toBeInstanceOf(MarkdownException);
    expect(exception).toBeInstanceOf(Exception);
    expect(exception).toBeInstanceOf(Error);
    expect(exception.message).toBe("Markdown parsing failed");
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual({});
    expect(exception.key).toBe("MARKDOWN_PARSE_FAILED");
  });

  test("should create MarkdownException with message and data", () => {
    const data = { path: "docs/readme.md" };
    const exception = new MarkdownException("Markdown file not found", "MARKDOWN_FILE_NOT_FOUND", data);

    expect(exception.message).toBe("Markdown file not found");
    expect(exception.data).toEqual(data);
    expect(exception.key).toBe("MARKDOWN_FILE_NOT_FOUND");
  });

  test("should have immutable data property", () => {
    const exception = new MarkdownException("Test message", "TEST_IMMUTABLE", { key: "value" });

    expect(Object.isFrozen(exception.data)).toBe(true);
    expect(() => {
      exception.data.key = "modified";
    }).toThrow();
  });

  test("should maintain proper stack trace", () => {
    const throwMarkdownException = () => {
      throw new MarkdownException("Stack trace test", "MARKDOWN_STACK_TRACE");
    };

    expect(throwMarkdownException).toThrow(MarkdownException);

    try {
      throwMarkdownException();
    } catch (error) {
      expect((error as MarkdownException).stack).toContain("throwMarkdownException");
      expect((error as MarkdownException).date).toBeInstanceOf(Date);
    }
  });
});
