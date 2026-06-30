import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@talosjs/app-env";
import { EventException } from "@/EventException";
import { RedisPubSubClient } from "@/RedisPubSubClient";

type TestData = { message: string; count: number };

// Default options that the client uses
const defaultOptions = {
  connectionTimeout: 10_000,
  idleTimeout: 0,
  autoReconnect: true,
  maxRetries: 10,
  enableOfflineQueue: true,
  enableAutoPipelining: true,
};

// Create mock subscriber client instance
const mockSubscriberClient = {
  subscribe: mock(async (_channel: string, _handler: (message: string, channel: string) => void): Promise<void> => {}),
  unsubscribe: mock(async (_channel?: string): Promise<void> => {}),
  close: mock((): void => {}),
};

// Create mock Redis client instance
const mockRedisClient = {
  publish: mock(async (_channel: string, _message: string): Promise<void> => {}),
  duplicate: mock(async () => mockSubscriberClient),
  close: mock((): void => {}),
};

// Mock the RedisClient constructor
const MockRedisClient = mock(() => mockRedisClient);

// Store original Bun.RedisClient to restore later
const originalRedisClient = Bun.RedisClient;

// Replace Bun.RedisClient with our mock
(Bun as { RedisClient: unknown }).RedisClient = MockRedisClient;

describe("RedisPubSubClient", () => {
  beforeAll(() => {
    Bun.env.PUBSUB_REDIS_URL = "redis://localhost:6379";
  });

  afterAll(() => {
    delete Bun.env.PUBSUB_REDIS_URL;
    (Bun as { RedisClient: unknown }).RedisClient = originalRedisClient;
  });

  beforeEach(() => {
    // Reset all mocks
    const mocksToReset = [
      mockRedisClient.publish,
      mockRedisClient.duplicate,
      mockRedisClient.close,
      mockSubscriberClient.subscribe,
      mockSubscriberClient.unsubscribe,
      mockSubscriberClient.close,
      MockRedisClient,
    ];

    mocksToReset.forEach((mockFn) => {
      if (mockFn && typeof mockFn.mockClear === "function") {
        mockFn.mockClear();
      }
    });

    // Reset mock implementations to defaults
    mockRedisClient.publish.mockImplementation(async (_channel: string, _message: string): Promise<void> => {});
    mockRedisClient.duplicate.mockImplementation(async () => mockSubscriberClient);
    mockSubscriberClient.subscribe.mockImplementation(
      async (_channel: string, _handler: (message: string, channel: string) => void): Promise<void> => {},
    );
    mockSubscriberClient.unsubscribe.mockImplementation(async (_channel?: string): Promise<void> => {});
  });

  describe("constructor", () => {
    test("should create RedisClient with connection string and default options", () => {
      new RedisPubSubClient<TestData>(new AppEnv(), {
        connectionString: "redis://custom:6379",
      });

      expect(MockRedisClient).toHaveBeenCalledWith("redis://custom:6379", defaultOptions);
    });

    test("should use default connection string from env", () => {
      const originalRedisUrl = Bun.env.PUBSUB_REDIS_URL;
      Bun.env.PUBSUB_REDIS_URL = "redis://env:6379";

      new RedisPubSubClient<TestData>(new AppEnv());

      expect(MockRedisClient).toHaveBeenCalledWith("redis://env:6379", defaultOptions);

      if (originalRedisUrl) {
        Bun.env.PUBSUB_REDIS_URL = originalRedisUrl;
      } else {
        delete Bun.env.PUBSUB_REDIS_URL;
      }
    });

    test("should merge additional client options with defaults", () => {
      const customOptions = { connectionTimeout: 5000 };
      new RedisPubSubClient<TestData>(new AppEnv(), {
        connectionString: "redis://localhost:6379",
        ...customOptions,
      });

      expect(MockRedisClient).toHaveBeenCalledWith("redis://localhost:6379", {
        ...defaultOptions,
        ...customOptions,
      });
    });

    test("should throw EventException when no connection string is provided", () => {
      delete Bun.env.PUBSUB_REDIS_URL;

      expect(() => new RedisPubSubClient<TestData>(new AppEnv())).toThrow(EventException);
      expect(() => new RedisPubSubClient<TestData>(new AppEnv())).toThrow(
        "Redis connection string is required. Please provide a connection string either through the constructor options or set the PUBSUB_REDIS_URL environment variable.",
      );

      Bun.env.PUBSUB_REDIS_URL = "redis://localhost:6379";
    });

    test("should create instance with custom options", () => {
      new RedisPubSubClient<TestData>(new AppEnv(), {
        connectionString: "redis://localhost:6379",
        connectionTimeout: 5000,
        idleTimeout: 15000,
        autoReconnect: false,
        maxRetries: 5,
        enableOfflineQueue: false,
        enableAutoPipelining: false,
      });

      expect(MockRedisClient).toHaveBeenCalledWith("redis://localhost:6379", {
        connectionTimeout: 5000,
        idleTimeout: 15000,
        autoReconnect: false,
        maxRetries: 5,
        enableOfflineQueue: false,
        enableAutoPipelining: false,
      });
    });

    test("should create instance with TLS options", () => {
      new RedisPubSubClient<TestData>(new AppEnv(), {
        connectionString: "rediss://secure:6379",
        tls: true,
      });

      expect(MockRedisClient).toHaveBeenCalledWith("rediss://secure:6379", {
        ...defaultOptions,
        tls: true,
      });
    });

    test("should create instance with TLS object options", () => {
      new RedisPubSubClient<TestData>(new AppEnv(), {
        connectionString: "rediss://secure:6379",
        tls: {
          rejectUnauthorized: false,
        },
      });

      expect(MockRedisClient).toHaveBeenCalledWith("rediss://secure:6379", {
        ...defaultOptions,
        tls: {
          rejectUnauthorized: false,
        },
      });
    });

    test("should allow overriding multiple options at once", () => {
      new RedisPubSubClient<TestData>(new AppEnv(), {
        connectionString: "redis://localhost:6379",
        connectionTimeout: 5000,
        idleTimeout: 60000,
        autoReconnect: false,
        maxRetries: 10,
        enableOfflineQueue: false,
        enableAutoPipelining: false,
        tls: true,
      });

      expect(MockRedisClient).toHaveBeenCalledWith("redis://localhost:6379", {
        connectionTimeout: 5000,
        idleTimeout: 60000,
        autoReconnect: false,
        maxRetries: 10,
        enableOfflineQueue: false,
        enableAutoPipelining: false,
        tls: true,
      });
    });
  });

  describe("IEventClient interface", () => {
    test("should implement publish method", () => {
      const client = new RedisPubSubClient<TestData>(new AppEnv(), {
        connectionString: "redis://localhost:6379",
      });

      expect(typeof client.publish).toBe("function");
    });

    test("should implement subscribe method", () => {
      const client = new RedisPubSubClient<TestData>(new AppEnv(), {
        connectionString: "redis://localhost:6379",
      });

      expect(typeof client.subscribe).toBe("function");
    });

    test("should implement unsubscribe method", () => {
      const client = new RedisPubSubClient<TestData>(new AppEnv(), {
        connectionString: "redis://localhost:6379",
      });

      expect(typeof client.unsubscribe).toBe("function");
    });

    test("should implement unsubscribeAll method", () => {
      const client = new RedisPubSubClient<TestData>(new AppEnv(), {
        connectionString: "redis://localhost:6379",
      });

      expect(typeof client.unsubscribeAll).toBe("function");
    });
  });

  describe("publish", () => {
    test("should publish serialized data to channel", async () => {
      const client = new RedisPubSubClient<TestData>(new AppEnv(), {
        connectionString: "redis://localhost:6379",
      });

      const data: TestData = { message: "hello", count: 42 };
      await client.publish({ channel: "test-channel", data });

      expect(mockRedisClient.publish).toHaveBeenCalledWith("test-channel", JSON.stringify(data));
    });

    test("should throw EventException on publish error", async () => {
      mockRedisClient.publish.mockRejectedValue(new Error("Redis publish failed"));

      const client = new RedisPubSubClient<TestData>(new AppEnv(), {
        connectionString: "redis://localhost:6379",
      });

      expect(client.publish({ channel: "test-channel", data: { message: "hello", count: 1 } })).rejects.toThrow(
        EventException,
      );
    });

    test("should handle subsequent publish calls", async () => {
      const client = new RedisPubSubClient<TestData>(new AppEnv(), {
        connectionString: "redis://localhost:6379",
      });

      await client.publish({ channel: "ch1", data: { message: "a", count: 1 } });
      await client.publish({ channel: "ch2", data: { message: "b", count: 2 } });
      await client.publish({ channel: "ch3", data: { message: "c", count: 3 } });

      expect(mockRedisClient.publish).toHaveBeenCalledTimes(3);
    });
  });

  describe("subscribe", () => {
    test("should create subscriber via duplicate and subscribe to channel", async () => {
      const client = new RedisPubSubClient<TestData>(new AppEnv(), {
        connectionString: "redis://localhost:6379",
      });

      const handler = mock(() => {});
      await client.subscribe("test-channel", handler);

      expect(mockRedisClient.duplicate).toHaveBeenCalledTimes(1);
      expect(mockSubscriberClient.subscribe).toHaveBeenCalledWith("test-channel", expect.any(Function));
    });

    test("should reuse existing subscriber for subsequent subscriptions", async () => {
      const client = new RedisPubSubClient<TestData>(new AppEnv(), {
        connectionString: "redis://localhost:6379",
      });

      const handler = mock(() => {});
      await client.subscribe("channel-1", handler);
      await client.subscribe("channel-2", handler);

      expect(mockRedisClient.duplicate).toHaveBeenCalledTimes(1);
      expect(mockSubscriberClient.subscribe).toHaveBeenCalledTimes(2);
    });

    test("should throw EventException on subscribe error", async () => {
      mockRedisClient.duplicate.mockRejectedValue(new Error("Duplicate failed"));

      const client = new RedisPubSubClient<TestData>(new AppEnv(), {
        connectionString: "redis://localhost:6379",
      });

      expect(
        client.subscribe(
          "test-channel",
          mock(() => {}),
        ),
      ).rejects.toThrow(EventException);
    });
  });

  describe("unsubscribe", () => {
    test("should not throw when subscriber is null", async () => {
      const client = new RedisPubSubClient<TestData>(new AppEnv(), {
        connectionString: "redis://localhost:6379",
      });

      expect(client.unsubscribe("test-channel")).resolves.toBeUndefined();
    });

    test("should call unsubscribe on subscriber", async () => {
      const client = new RedisPubSubClient<TestData>(new AppEnv(), {
        connectionString: "redis://localhost:6379",
      });

      const handler = mock(() => {});
      await client.subscribe("test-channel", handler);
      await client.unsubscribe("test-channel");

      expect(mockSubscriberClient.unsubscribe).toHaveBeenCalledWith("test-channel");
    });

    test("should throw EventException on unsubscribe error", async () => {
      mockSubscriberClient.unsubscribe.mockRejectedValue(new Error("Unsubscribe failed"));

      const client = new RedisPubSubClient<TestData>(new AppEnv(), {
        connectionString: "redis://localhost:6379",
      });

      const handler = mock(() => {});
      await client.subscribe("test-channel", handler);

      expect(client.unsubscribe("test-channel")).rejects.toThrow(EventException);
    });
  });

  describe("unsubscribeAll", () => {
    test("should not throw when subscriber is null", async () => {
      const client = new RedisPubSubClient<TestData>(new AppEnv(), {
        connectionString: "redis://localhost:6379",
      });

      expect(client.unsubscribeAll()).resolves.toBeUndefined();
    });

    test("should call unsubscribe without args on subscriber", async () => {
      const client = new RedisPubSubClient<TestData>(new AppEnv(), {
        connectionString: "redis://localhost:6379",
      });

      const handler = mock(() => {});
      await client.subscribe("test-channel", handler);
      await client.unsubscribeAll();

      expect(mockSubscriberClient.unsubscribe).toHaveBeenCalledWith();
    });

    test("should throw EventException on unsubscribeAll error", async () => {
      mockSubscriberClient.unsubscribe.mockRejectedValueOnce(new Error("Unsubscribe all failed"));

      const client = new RedisPubSubClient<TestData>(new AppEnv(), {
        connectionString: "redis://localhost:6379",
      });

      const handler = mock(() => {});
      await client.subscribe("test-channel", handler);

      expect(client.unsubscribeAll()).rejects.toThrow(EventException);
    });
  });

  describe("close", () => {
    test("should close the client", () => {
      const client = new RedisPubSubClient<TestData>(new AppEnv(), {
        connectionString: "redis://localhost:6379",
      });

      client.close();

      expect(mockRedisClient.close).toHaveBeenCalledTimes(1);
    });

    test("should close both client and subscriber", async () => {
      const client = new RedisPubSubClient<TestData>(new AppEnv(), {
        connectionString: "redis://localhost:6379",
      });

      const handler = mock(() => {});
      await client.subscribe("test-channel", handler);
      client.close();

      expect(mockSubscriberClient.close).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.close).toHaveBeenCalledTimes(1);
    });

    test("should handle close when subscriber is null", () => {
      const client = new RedisPubSubClient<TestData>(new AppEnv(), {
        connectionString: "redis://localhost:6379",
      });

      client.close();

      expect(mockSubscriberClient.close).not.toHaveBeenCalled();
      expect(mockRedisClient.close).toHaveBeenCalledTimes(1);
    });
  });

  describe("type safety", () => {
    test("should work with custom data types", () => {
      type CustomData = {
        userId: string;
        action: "create" | "update" | "delete";
        timestamp: number;
      };

      const client = new RedisPubSubClient<CustomData>(new AppEnv(), {
        connectionString: "redis://localhost:6379",
      });

      expect(client).toBeInstanceOf(RedisPubSubClient);
    });

    test("should work with flat data types containing multiple scalar fields", () => {
      type FlatData = {
        userId: string;
        userName: string;
        createdAt: number;
        isActive: boolean;
      };

      const client = new RedisPubSubClient<FlatData>(new AppEnv(), {
        connectionString: "redis://localhost:6379",
      });

      expect(client).toBeInstanceOf(RedisPubSubClient);
    });
  });

  describe("client lifecycle", () => {
    test("should use the same client for multiple publish calls", async () => {
      const client = new RedisPubSubClient<TestData>(new AppEnv(), {
        connectionString: "redis://localhost:6379",
      });

      await client.publish({ channel: "ch1", data: { message: "a", count: 1 } });
      await client.publish({ channel: "ch2", data: { message: "b", count: 2 } });

      expect(mockRedisClient.publish).toHaveBeenCalledTimes(2);
    });
  });
});
