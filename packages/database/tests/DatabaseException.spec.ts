import { describe, expect, test } from "bun:test";
import { Exception } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";
import { DatabaseException } from "../src";

describe("DatabaseException", () => {
  test("should have correct exception name", () => {
    const exception = new DatabaseException("Test message", "CONNECTION_FAILED");
    expect(exception.name).toBe("DatabaseException");
  });

  test("should create DatabaseException with message only", () => {
    const message = "Database connection failed";
    const exception = new DatabaseException(message, "CONNECTION_FAILED");

    expect(exception).toBeInstanceOf(DatabaseException);
    expect(exception).toBeInstanceOf(Exception);
    expect(exception).toBeInstanceOf(Error);
    expect(exception.message).toBe(message);
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual({});
    expect(exception.key).toBe("CONNECTION_FAILED");
  });

  test("should create DatabaseException with message and data", () => {
    const message = "Query execution failed";
    const data = { queryId: "SELECT_USER_001", reason: "Connection timeout" };
    const exception = new DatabaseException(message, "OPERATION_FAILED", data);

    expect(exception.message).toBe(message);
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual(data);
    expect(exception.key).toBe("OPERATION_FAILED");
  });

  test("should have immutable data property", () => {
    const data = { key: "value" };
    const exception = new DatabaseException("Test message", "CONNECTION_FAILED", data);

    expect(Object.isFrozen(exception.data)).toBe(true);
    expect(() => {
      exception.data.key = "modified";
    }).toThrow();
  });

  test("should inherit all properties from Exception", () => {
    const message = "Database error";
    const data = { table: "users" };
    const exception = new DatabaseException(message, "CONNECTION_FAILED", data);

    expect(exception.date).toBeInstanceOf(Date);
    expect(exception.status).toBe(500);
    expect(exception.data).toEqual(data);
    expect(exception.stack).toBeDefined();
  });

  test("should maintain proper stack trace", () => {
    function throwDatabaseException() {
      throw new DatabaseException("Stack trace test", "CONNECTION_FAILED");
    }

    try {
      throwDatabaseException();
      // biome-ignore lint/suspicious/noExplicitAny: trust me
    } catch (error: any) {
      expect(error).toBeInstanceOf(DatabaseException);
      expect(error.stack).toContain("throwDatabaseException");
    }
  });
});
