import { describe, expect, test } from "bun:test";
import { DirectoryException } from "@/index";

describe("DirectoryException", () => {
  describe("constructor", () => {
    test("should create an instance with message only", () => {
      const exception = new DirectoryException("Directory not found", "NOT_FOUND");
      expect(exception).toBeInstanceOf(DirectoryException);
      expect(exception).toBeInstanceOf(Error);
      expect(exception.key).toBe("NOT_FOUND");
    });

    test("should create an instance with message and data", () => {
      const data = { path: "/tmp/dir", operation: "mkdir" };
      const exception = new DirectoryException("Failed to create directory", "CREATE_FAILED", data);
      expect(exception).toBeInstanceOf(DirectoryException);
      expect(exception.key).toBe("CREATE_FAILED");
    });
  });

  describe("name", () => {
    test("should have name set to DirectoryException", () => {
      const exception = new DirectoryException("Test error", "TEST_ERROR");
      expect(exception.name).toBe("DirectoryException");
    });
  });

  describe("message", () => {
    test("should have correct message", () => {
      const exception = new DirectoryException("Custom error message", "CUSTOM_ERROR");
      expect(exception.message).toBe("Custom error message");
    });

    test("should handle empty message", () => {
      const exception = new DirectoryException("", "EMPTY_MESSAGE");
      expect(exception.message).toBe("");
    });
  });

  describe("status", () => {
    test("should have default status 500 (Internal Server Error)", () => {
      const exception = new DirectoryException("Test", "TEST_STATUS");
      expect(exception.status).toBe(500);
    });
  });

  describe("data", () => {
    test("should have empty data by default", () => {
      const exception = new DirectoryException("Test", "TEST_DATA");
      expect(exception.data).toEqual({});
    });

    test("should store provided data", () => {
      const data = { path: "/tmp/dir", error: "ENOENT" };
      const exception = new DirectoryException("Test", "TEST_DATA", data);
      expect(exception.data).toEqual(data);
    });

    test("should have immutable data property", () => {
      const data = { key: "value" };
      const exception = new DirectoryException("Test", "TEST_DATA", data);
      expect(Object.isFrozen(exception.data)).toBe(true);
    });

    test("should not allow data modification", () => {
      const exception = new DirectoryException("Test", "TEST_DATA", { key: "value" });
      expect(() => {
        (exception.data as Record<string, unknown>).key = "modified";
      }).toThrow();
    });
  });

  describe("date", () => {
    test("should have a date property", () => {
      const before = new Date();
      const exception = new DirectoryException("Test", "TEST_DATE");
      const after = new Date();

      expect(exception.date).toBeInstanceOf(Date);
      expect(exception.date.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(exception.date.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("stack", () => {
    test("should have a stack trace", () => {
      const exception = new DirectoryException("Test", "TEST_STACK");
      expect(exception.stack).toBeDefined();
      expect(typeof exception.stack).toBe("string");
    });
  });

  describe("stackToJson", () => {
    test("should convert stack to JSON array", () => {
      const exception = new DirectoryException("Test", "TEST_STACK_JSON");
      const stackJson = exception.stackToJson();

      expect(stackJson).toBeInstanceOf(Array);
      expect(stackJson?.length).toBeGreaterThan(0);
    });

    test("should have source property in each frame", () => {
      const exception = new DirectoryException("Test", "TEST_STACK_SOURCE");
      const stackJson = exception.stackToJson();

      expect(stackJson).toBeDefined();
      for (const frame of stackJson ?? []) {
        expect(frame.source).toBeDefined();
        expect(typeof frame.source).toBe("string");
      }
    });
  });

  describe("inheritance", () => {
    test("should be throwable", () => {
      expect(() => {
        throw new DirectoryException("Test error", "TEST_THROWABLE");
      }).toThrow(DirectoryException);
    });

    test("should be catchable as Error", () => {
      try {
        throw new DirectoryException("Test error", "TEST_CATCHABLE");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(DirectoryException);
      }
    });

    test("should work with try-catch pattern", () => {
      let caught = false;
      try {
        throw new DirectoryException("Operation failed", "TEST_TRY_CATCH", { path: "/test" });
      } catch (error) {
        if (error instanceof DirectoryException) {
          caught = true;
          expect(error.message).toBe("Operation failed");
          expect(error.data).toEqual({ path: "/test" });
        }
      }
      expect(caught).toBe(true);
    });
  });
});
