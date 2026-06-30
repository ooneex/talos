import { describe, expect, test } from "bun:test";
import { Exception } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";
import { EventException } from "@/EventException";

describe("EventException", () => {
  describe("Constructor", () => {
    test("should create exception with message only", () => {
      const exception = new EventException("Test error", "TEST_ERROR");

      expect(exception).toBeInstanceOf(EventException);
      expect(exception.message).toBe("Test error");
      expect(exception.key).toBe("TEST_ERROR");
    });

    test("should create exception with message and data", () => {
      const data = { channel: "test-channel", operation: "publish" };
      const exception = new EventException("Publish failed", "PUBLISH_FAILED", data);

      expect(exception.message).toBe("Publish failed");
      expect(exception.key).toBe("PUBLISH_FAILED");
      expect(exception.data).toEqual(data);
    });

    test("should create exception with empty data by default", () => {
      const exception = new EventException("Error", "TEST_ERROR");

      expect(exception.data).toEqual({});
    });
  });

  describe("Inheritance", () => {
    test("should extend Exception", () => {
      const exception = new EventException("Test", "TEST_KEY");

      expect(exception).toBeInstanceOf(Exception);
    });

    test("should extend Error", () => {
      const exception = new EventException("Test", "TEST_KEY");

      expect(exception).toBeInstanceOf(Error);
    });
  });

  describe("Name", () => {
    test("should have name 'EventException'", () => {
      const exception = new EventException("Test", "TEST_KEY");

      expect(exception.name).toBe("EventException");
    });
  });

  describe("Status", () => {
    test("should have InternalServerError status code", () => {
      const exception = new EventException("Test", "TEST_KEY");

      expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
      expect(exception.status).toBe(500);
    });
  });

  describe("Date", () => {
    test("should have date property", () => {
      const beforeDate = Date.now();
      const exception = new EventException("Test", "TEST_KEY");
      const afterDate = Date.now();

      expect(exception.date).toBeInstanceOf(Date);
      expect(exception.date.getTime()).toBeGreaterThanOrEqual(beforeDate);
      expect(exception.date.getTime()).toBeLessThanOrEqual(afterDate);
    });
  });

  describe("Data", () => {
    test("should freeze data property", () => {
      const data = { key: "value" };
      const exception = new EventException("Test", "TEST_KEY", data);

      expect(Object.isFrozen(exception.data)).toBe(true);
    });

    test("should not allow data modification", () => {
      const exception = new EventException("Test", "TEST_KEY", { key: "value" });

      expect(() => {
        exception.data.key = "modified";
      }).toThrow();
    });

    test("should handle complex data objects", () => {
      const data = {
        channel: "notifications",
        operation: "subscribe",
        clientId: "client-123",
        error: {
          code: "CONN_REFUSED",
          message: "Connection refused",
        },
        metadata: {
          timestamp: Date.now(),
          retries: 3,
        },
      };
      const exception = new EventException("Connection failed", "CONNECTION_FAILED", data);

      expect(exception.data).toEqual(data);
      expect(exception.data.channel).toBe("notifications");
      expect((exception.data.error as { code: string }).code).toBe("CONN_REFUSED");
    });
  });

  describe("Stack trace", () => {
    test("should have stack trace", () => {
      const exception = new EventException("Test", "TEST_KEY");

      expect(exception.stack).toBeDefined();
      expect(typeof exception.stack).toBe("string");
    });

    test("should support stackToJson method", () => {
      const exception = new EventException("Test", "TEST_KEY");
      const stackJson = exception.stackToJson();

      expect(stackJson).toBeDefined();
      if (stackJson) {
        expect(Array.isArray(stackJson)).toBe(true);
      }
    });
  });

  describe("Error scenarios", () => {
    test("should handle publish errors", () => {
      const exception = new EventException('Failed to publish message to channel "orders"', "PUBLISH_FAILED", {
        channel: "orders",
        operation: "publish",
        messageSize: 1024,
      });

      expect(exception.message).toContain("Failed to publish");
      expect(exception.data.channel).toBe("orders");
      expect(exception.data.operation).toBe("publish");
    });

    test("should handle subscribe errors", () => {
      const exception = new EventException('Failed to subscribe to channel "events"', "SUBSCRIBE_FAILED", {
        channel: "events",
        operation: "subscribe",
        reason: "Channel does not exist",
      });

      expect(exception.message).toContain("Failed to subscribe");
      expect(exception.data.channel).toBe("events");
    });

    test("should handle unsubscribe errors", () => {
      const exception = new EventException('Failed to unsubscribe from channel "updates"', "UNSUBSCRIBE_FAILED", {
        channel: "updates",
        operation: "unsubscribe",
      });

      expect(exception.message).toContain("Failed to unsubscribe");
      expect(exception.data.operation).toBe("unsubscribe");
    });

    test("should handle connection errors", () => {
      const exception = new EventException("Redis connection string is required", "CONNECTION_FAILED", {
        configKey: "PUBSUB_REDIS_URL",
      });

      expect(exception.message).toContain("connection string is required");
    });
  });

  describe("Serialization", () => {
    test("should be JSON serializable", () => {
      const exception = new EventException("Test error", "TEST_KEY", { key: "value" });

      const serialized = JSON.stringify({
        message: exception.message,
        name: exception.name,
        status: exception.status,
        data: exception.data,
        date: exception.date,
      });
      const parsed = JSON.parse(serialized);

      expect(parsed.message).toBe("Test error");
      expect(parsed.name).toBe("EventException");
      expect(parsed.status).toBe(500);
      expect(parsed.data).toEqual({ key: "value" });
    });

    test("should have correct toString representation", () => {
      const exception = new EventException("Test error", "TEST_KEY");
      const stringRep = exception.toString();

      expect(stringRep).toContain("EventException");
      expect(stringRep).toContain("Test error");
    });
  });

  describe("Edge cases", () => {
    test("should handle empty message", () => {
      const exception = new EventException("", "TEST_KEY");

      expect(exception.message).toBe("");
    });

    test("should handle very long messages", () => {
      const longMessage = "x".repeat(1000);
      const exception = new EventException(longMessage, "TEST_KEY");

      expect(exception.message).toBe(longMessage);
      expect(exception.message.length).toBe(1000);
    });

    test("should handle special characters in message", () => {
      const specialMessage = "Error: 特殊文字 ⚠️ with émojis and ñumbers 123!@#$%^&*()";
      const exception = new EventException(specialMessage, "TEST_KEY");

      expect(exception.message).toBe(specialMessage);
    });

    test("should handle null and undefined in data", () => {
      const data = {
        nullValue: null,
        undefinedValue: undefined,
      };
      const exception = new EventException("Test", "TEST_KEY", data);

      expect(exception.data.nullValue).toBeNull();
      expect(exception.data.undefinedValue).toBeUndefined();
    });

    test("should handle array values in data", () => {
      const data = {
        channels: ["ch1", "ch2", "ch3"],
        errorCodes: [100, 200, 300],
      };
      const exception = new EventException("Test", "TEST_KEY", data);

      expect(exception.data.channels).toEqual(["ch1", "ch2", "ch3"]);
      expect(exception.data.errorCodes).toEqual([100, 200, 300]);
    });
  });
});
