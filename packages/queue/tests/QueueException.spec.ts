import { describe, expect, test } from "bun:test";
import { Exception } from "@talosjs/exception";
import { QueueException } from "@/index";

describe("QueueException", () => {
  describe("Name", () => {
    test("should have correct exception name", () => {
      const exception = new QueueException("Test message", "TEST_KEY");

      expect(exception.name).toBe("QueueException");
    });
  });

  describe("Inheritance", () => {
    test("should inherit from Exception and Error", () => {
      const exception = new QueueException("Test message", "TEST_KEY");

      expect(exception).toBeInstanceOf(QueueException);
      expect(exception).toBeInstanceOf(Exception);
      expect(exception).toBeInstanceOf(Error);
    });
  });

  describe("Constructor", () => {
    test("should create exception with message and key", () => {
      const message = "Queue Redis URL is required.";
      const key = "QUEUE_REDIS_URL_REQUIRED";
      const exception = new QueueException(message, key);

      expect(exception.message).toBe(message);
      expect(exception.key).toBe(key);
    });

    test("should default to InternalServerError (500) status", () => {
      const exception = new QueueException("Test message", "TEST_KEY");

      expect(exception.status).toBe(500);
    });

    test("should default to empty data object", () => {
      const exception = new QueueException("Test message", "TEST_KEY");

      expect(exception.data).toEqual({});
    });

    test("should accept custom data", () => {
      const data = { queue: "emails", jobId: "123" };
      const exception = new QueueException("Test message", "TEST_KEY", data);

      expect(exception.data).toEqual(data);
      expect(exception.data?.queue).toBe("emails");
      expect(exception.data?.jobId).toBe("123");
    });

    test("should freeze the data property", () => {
      const exception = new QueueException("Test message", "TEST_KEY", { count: 1 });

      expect(Object.isFrozen(exception.data)).toBe(true);
      expect(() => {
        exception.data.count = 2;
      }).toThrow();
    });
  });

  describe("Throwing", () => {
    test("should be throwable and catchable", () => {
      const throwIt = () => {
        throw new QueueException("Connection refused", "QUEUE_CONNECTION_REFUSED");
      };

      expect(throwIt).toThrow(QueueException);
      expect(throwIt).toThrow("Connection refused");
    });

    test("should preserve key and status when caught", () => {
      try {
        throw new QueueException("Boom", "QUEUE_BOOM");
        // biome-ignore lint/suspicious/noExplicitAny: trust me
      } catch (error: any) {
        expect(error).toBeInstanceOf(QueueException);
        expect(error.key).toBe("QUEUE_BOOM");
        expect(error.status).toBe(500);
      }
    });
  });
});
