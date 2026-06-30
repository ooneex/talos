import { describe, expect, test } from "bun:test";
import { Exception } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";

const { StorageException } = await import("@/StorageException");

describe("StorageException", () => {
  test("should have correct exception name", () => {
    const exception = new StorageException("Test message", "TEST_KEY");
    expect(exception.name).toBe("StorageException");
  });

  test("should create StorageException with message only", () => {
    const message = "Storage operation failed";
    const exception = new StorageException(message, "STORAGE_OPERATION_FAILED");

    expect(exception).toBeInstanceOf(StorageException);
    expect(exception).toBeInstanceOf(Exception);
    expect(exception).toBeInstanceOf(Error);
    expect(exception.message).toBe(message);
    expect(exception.key).toBe("STORAGE_OPERATION_FAILED");
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual({});
  });

  test("should create StorageException with message and data", () => {
    const message = "File upload failed";
    const data = { filename: "document.pdf", size: 1024 };
    const exception = new StorageException(message, "STORAGE_UPLOAD_FAILED", data);

    expect(exception.message).toBe(message);
    expect(exception.key).toBe("STORAGE_UPLOAD_FAILED");
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual(data);
  });

  test("should have immutable data property", () => {
    const data = { key: "value" };
    const exception = new StorageException("Test message", "TEST_KEY", data);

    expect(Object.isFrozen(exception.data)).toBe(true);
    expect(() => {
      exception.data.key = "modified";
    }).toThrow();
  });

  test("should inherit all properties from Exception", () => {
    const message = "Storage error";
    const data = { bucket: "uploads", path: "/images" };
    const exception = new StorageException(message, "STORAGE_ERROR", data);

    expect(exception.date).toBeInstanceOf(Date);
    expect(exception.status).toBe(500);
    expect(exception.data).toEqual(data);
    expect(exception.stack).toBeDefined();
  });

  test("should maintain proper stack trace", () => {
    function throwStorageException() {
      throw new StorageException("Stack trace test", "STACK_TRACE_TEST");
    }

    try {
      throwStorageException();
      // biome-ignore lint/suspicious/noExplicitAny: trust me
    } catch (error: any) {
      expect(error).toBeInstanceOf(StorageException);
      expect(error.stack).toContain("throwStorageException");
    }
  });
});
