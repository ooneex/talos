import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@talosjs/app-env";
import { RedisCache } from "@/index";

// Default options that the adapter uses
const defaultOptions = {
  connectionTimeout: 10_000,
  idleTimeout: 0,
  autoReconnect: true,
  maxRetries: 10,
  enableOfflineQueue: true,
  enableAutoPipelining: true,
};

// Create mock Redis client instance
const mockRedisClient = {
  connected: false,
  connect: mock(async (): Promise<void> => {
    mockRedisClient.connected = true;
  }),
  get: mock(async (_key: string): Promise<string | null> => null),
  set: mock(async (_key: string, _value: string): Promise<void> => {}),
  del: mock(async (..._keys: string[]): Promise<number> => 1),
  exists: mock(async (_key: string): Promise<boolean> => false),
  expire: mock(async (_key: string, _seconds: number): Promise<number> => 1),
  scan: mock(async (_cursor: string | number, ..._args: (string | number)[]): Promise<[string, string[]]> => ["0", []]),
};

// Mock the RedisClient constructor
const MockRedisClient = mock(() => mockRedisClient);

// Store original Bun.RedisClient to restore later
const originalRedisClient = Bun.RedisClient;

// Replace Bun.RedisClient with our mock
(Bun as { RedisClient: unknown }).RedisClient = MockRedisClient;

describe("RedisCacheAdapter", () => {
  let adapter: RedisCache;
  const testKey = "test-key";
  const testValue = "test-value";

  beforeAll(() => {
    // Set environment variable for tests that rely on it
    Bun.env.CACHE_REDIS_URL = "redis://localhost:6379";
  });

  afterAll(() => {
    // Clean up environment variable
    delete Bun.env.CACHE_REDIS_URL;
    // Restore original RedisClient
    (Bun as { RedisClient: unknown }).RedisClient = originalRedisClient;
  });

  beforeEach(() => {
    // Reset connected state
    mockRedisClient.connected = false;

    // Create a new adapter for each test to reset isConnected state
    adapter = new RedisCache(new AppEnv(), {
      connectionString: "redis://localhost:6379/1",
    });

    // Reset all mocks
    const mocksToReset = [
      mockRedisClient.connect,
      mockRedisClient.get,
      mockRedisClient.set,
      mockRedisClient.del,
      mockRedisClient.exists,
      mockRedisClient.expire,
      mockRedisClient.scan,
      MockRedisClient,
    ];

    mocksToReset.forEach((mockFn) => {
      if (mockFn && typeof mockFn.mockClear === "function") {
        mockFn.mockClear();
      }
    });

    // Reset mock implementations to defaults
    mockRedisClient.connect.mockImplementation(async (): Promise<void> => {
      mockRedisClient.connected = true;
    });
    mockRedisClient.get.mockImplementation(async (_key: string): Promise<string | null> => null);
    mockRedisClient.set.mockImplementation(async (_key: string, _value: string): Promise<void> => {});
    mockRedisClient.del.mockImplementation(async (..._keys: string[]): Promise<number> => 1);
    mockRedisClient.exists.mockImplementation(async (_key: string): Promise<boolean> => false);
    mockRedisClient.expire.mockImplementation(async (_key: string, _seconds: number): Promise<number> => 1);
    mockRedisClient.scan.mockImplementation(
      async (_cursor: string | number, ..._args: (string | number)[]): Promise<[string, string[]]> => ["0", []],
    );
  });

  describe("constructor", () => {
    test("should create RedisClient with connection string and default options", () => {
      new RedisCache(new AppEnv(), {
        connectionString: "redis://test:6379/2",
      });

      expect(MockRedisClient).toHaveBeenCalledWith("redis://test:6379/2", defaultOptions);
    });

    test("should use default connection string from env", () => {
      const originalRedisUrl = Bun.env.CACHE_REDIS_URL;
      Bun.env.CACHE_REDIS_URL = "redis://localhost:6379";

      new RedisCache(new AppEnv());

      expect(MockRedisClient).toHaveBeenCalledWith("redis://localhost:6379", defaultOptions);

      if (originalRedisUrl) {
        Bun.env.CACHE_REDIS_URL = originalRedisUrl;
      } else {
        delete Bun.env.CACHE_REDIS_URL;
      }
    });

    test("should merge additional client options with defaults", () => {
      const customOptions = { connectionTimeout: 5000 };
      new RedisCache(new AppEnv(), {
        connectionString: "redis://localhost:6379",
        ...customOptions,
      });

      expect(MockRedisClient).toHaveBeenCalledWith("redis://localhost:6379", {
        ...defaultOptions,
        ...customOptions,
      });
    });
  });

  describe("get method", () => {
    test("should return undefined for non-existent key", async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await adapter.get("non-existent-key");
      expect(result).toBeUndefined();
      expect(mockRedisClient.get).toHaveBeenCalledWith("cache:non-existent-key");
    });

    test("should retrieve string value", async () => {
      mockRedisClient.get.mockResolvedValue(testValue);

      const result = await adapter.get<string>(testKey);
      expect(result).toBe(testValue);
      expect(mockRedisClient.get).toHaveBeenCalledWith(`cache:${testKey}`);
    });

    test("should retrieve number value", async () => {
      const numberValue = 42;
      mockRedisClient.get.mockResolvedValue(JSON.stringify(numberValue));

      const result = await adapter.get<number>(testKey);
      expect(result).toBe(numberValue);
    });

    test("should retrieve boolean value", async () => {
      const boolValue = true;
      mockRedisClient.get.mockResolvedValue(JSON.stringify(boolValue));

      const result = await adapter.get<boolean>(testKey);
      expect(result).toBe(boolValue);
    });

    test("should retrieve object value", async () => {
      const objectValue = { name: "test", age: 25, active: true };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(objectValue));

      const result = await adapter.get<typeof objectValue>(testKey);
      expect(result).toEqual(objectValue);
    });

    test("should retrieve array value", async () => {
      const arrayValue = [1, 2, 3, "test", { nested: true }];
      mockRedisClient.get.mockResolvedValue(JSON.stringify(arrayValue));

      const result = await adapter.get<typeof arrayValue>(testKey);
      expect(result).toEqual(arrayValue);
    });

    test("should retrieve null value", async () => {
      const nullValue = null;
      mockRedisClient.get.mockResolvedValue(JSON.stringify(nullValue));

      const result = await adapter.get(testKey);
      expect(result).toBeNull();
    });

    test("should handle complex nested objects", async () => {
      const complexObject = {
        id: 123,
        user: {
          name: "John Doe",
          preferences: {
            theme: "dark",
            notifications: true,
            tags: ["developer", "typescript"],
          },
        },
        metadata: {
          createdAt: new Date().toISOString(),
          version: "1.0.0",
        },
      };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(complexObject));

      const result = await adapter.get<typeof complexObject>(testKey);
      expect(result).toEqual(complexObject);
    });

    test("should return raw string value when JSON parsing fails", async () => {
      const rawValue = "not-valid-json{";
      mockRedisClient.get.mockResolvedValue(rawValue);

      const result = await adapter.get<string>(testKey);
      expect(result).toBe(rawValue);
    });

    test("should throw on Redis error", async () => {
      mockRedisClient.get.mockRejectedValue(new Error("Redis connection failed"));

      expect(adapter.get(testKey)).rejects.toThrow(Error);
      expect(adapter.get(testKey)).rejects.toThrow("Redis connection failed");
    });

    test("should handle subsequent calls", async () => {
      mockRedisClient.get.mockResolvedValue(testValue);

      await adapter.get(testKey);
      await adapter.get(testKey);
      await adapter.get(testKey);

      expect(mockRedisClient.get).toHaveBeenCalledTimes(3);
    });
  });

  describe("set method", () => {
    test("should store string value", async () => {
      await adapter.set(testKey, testValue);

      expect(mockRedisClient.set).toHaveBeenCalledWith(`cache:${testKey}`, testValue);
    });

    test("should store number value", async () => {
      const numberValue = 123.45;
      await adapter.set(testKey, numberValue);

      expect(mockRedisClient.set).toHaveBeenCalledWith(`cache:${testKey}`, JSON.stringify(numberValue));
    });

    test("should store boolean value", async () => {
      const boolValue = false;
      await adapter.set(testKey, boolValue);

      expect(mockRedisClient.set).toHaveBeenCalledWith(`cache:${testKey}`, JSON.stringify(boolValue));
    });

    test("should store object value", async () => {
      const objectValue = { message: "hello", count: 5 };
      await adapter.set(testKey, objectValue);

      expect(mockRedisClient.set).toHaveBeenCalledWith(`cache:${testKey}`, JSON.stringify(objectValue));
    });

    test("should store array value", async () => {
      const arrayValue = ["a", "b", "c"];
      await adapter.set(testKey, arrayValue);

      expect(mockRedisClient.set).toHaveBeenCalledWith(`cache:${testKey}`, JSON.stringify(arrayValue));
    });

    test("should store value with TTL using set and expire", async () => {
      const ttlSeconds = 2;
      await adapter.set(testKey, testValue, ttlSeconds);

      expect(mockRedisClient.set).toHaveBeenCalledWith(`cache:${testKey}`, testValue);
      expect(mockRedisClient.expire).toHaveBeenCalledWith(`cache:${testKey}`, ttlSeconds);
    });

    test("should handle empty string value", async () => {
      const emptyString = "";
      await adapter.set(testKey, emptyString);

      expect(mockRedisClient.set).toHaveBeenCalledWith(`cache:${testKey}`, emptyString);
    });

    test("should handle zero as value", async () => {
      const zeroValue = 0;
      await adapter.set(testKey, zeroValue);

      expect(mockRedisClient.set).toHaveBeenCalledWith(`cache:${testKey}`, JSON.stringify(zeroValue));
    });

    test("should handle null as value", async () => {
      const nullValue = null;
      await adapter.set(testKey, nullValue);

      expect(mockRedisClient.set).toHaveBeenCalledWith(`cache:${testKey}`, JSON.stringify(nullValue));
    });

    test("should handle undefined value (should serialize as null)", async () => {
      const undefinedValue = undefined;
      await adapter.set(testKey, undefinedValue);

      expect(mockRedisClient.set).toHaveBeenCalledWith(`cache:${testKey}`, "null");
    });

    test("should set value with zero TTL (should behave as no TTL)", async () => {
      await adapter.set(testKey, testValue, 0);

      expect(mockRedisClient.set).toHaveBeenCalledWith(`cache:${testKey}`, testValue);
      expect(mockRedisClient.expire).not.toHaveBeenCalled();
    });

    test("should throw on Redis error", async () => {
      mockRedisClient.set.mockRejectedValue(new Error("Redis write failed"));

      expect(adapter.set(testKey, testValue)).rejects.toThrow(Error);
      expect(adapter.set(testKey, testValue)).rejects.toThrow("Redis write failed");
    });

    test("should handle subsequent calls", async () => {
      await adapter.set("key1", "value1");
      await adapter.set("key2", "value2");
      await adapter.set("key3", "value3");

      expect(mockRedisClient.set).toHaveBeenCalledTimes(3);
    });
  });

  describe("delete method", () => {
    test("should delete existing key", async () => {
      mockRedisClient.del.mockResolvedValue(1);

      const result = await adapter.delete(testKey);
      expect(result).toBe(true);
      expect(mockRedisClient.del).toHaveBeenCalledWith(`cache:${testKey}`);
    });

    test("should return false for non-existent key", async () => {
      mockRedisClient.del.mockResolvedValue(0);

      const result = await adapter.delete("non-existent");
      expect(result).toBe(false);
    });

    test("should delete multiple keys when Redis returns count > 1", async () => {
      mockRedisClient.del.mockResolvedValue(3);

      const result = await adapter.delete("some-key");
      expect(result).toBe(true);
      expect(mockRedisClient.del).toHaveBeenCalledWith("cache:some-key");
    });

    test("should handle empty string key", async () => {
      mockRedisClient.del.mockResolvedValue(0);

      const result = await adapter.delete("");
      expect(result).toBe(false);
      expect(mockRedisClient.del).toHaveBeenCalledWith("cache:");
    });

    test("should handle key with special characters", async () => {
      const specialKey = "key:with:colons-and_underscores.dots@symbols";
      mockRedisClient.del.mockResolvedValue(1);

      const result = await adapter.delete(specialKey);
      expect(result).toBe(true);
      expect(mockRedisClient.del).toHaveBeenCalledWith(`cache:${specialKey}`);
    });

    test("should handle very long key names", async () => {
      const longKey = "a".repeat(1000);
      mockRedisClient.del.mockResolvedValue(1);

      const result = await adapter.delete(longKey);
      expect(result).toBe(true);
      expect(mockRedisClient.del).toHaveBeenCalledWith(`cache:${longKey}`);
    });

    test("should handle Unicode key names", async () => {
      const unicodeKey = "测试键名🔑";
      mockRedisClient.del.mockResolvedValue(1);

      const result = await adapter.delete(unicodeKey);
      expect(result).toBe(true);
      expect(mockRedisClient.del).toHaveBeenCalledWith(`cache:${unicodeKey}`);
    });

    test("should throw on Redis error", async () => {
      mockRedisClient.del.mockRejectedValue(new Error("Redis delete failed"));

      expect(adapter.delete(testKey)).rejects.toThrow("Redis delete failed");
    });

    test("should throw on Redis connection error", async () => {
      mockRedisClient.del.mockRejectedValue(new Error("ECONNREFUSED"));

      expect(adapter.delete(testKey)).rejects.toThrow("ECONNREFUSED");
    });

    test("should throw on Redis timeout", async () => {
      mockRedisClient.del.mockRejectedValue(new Error("Command timed out"));

      expect(adapter.delete(testKey)).rejects.toThrow("Command timed out");
    });

    test("should handle subsequent calls", async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await adapter.delete("key1");
      await adapter.delete("key2");
      await adapter.delete("key3");

      expect(mockRedisClient.del).toHaveBeenCalledTimes(3);
    });
  });

  describe("has method", () => {
    test("should return true for existing key", async () => {
      mockRedisClient.exists.mockResolvedValue(true);

      const result = await adapter.has(testKey);
      expect(result).toBe(true);
      expect(mockRedisClient.exists).toHaveBeenCalledWith(`cache:${testKey}`);
    });

    test("should return false for non-existent key", async () => {
      mockRedisClient.exists.mockResolvedValue(false);

      const result = await adapter.has("non-existent");
      expect(result).toBe(false);
    });

    test("should handle repeated existence checks on same key", async () => {
      mockRedisClient.exists.mockResolvedValue(true);

      const result1 = await adapter.has(testKey);
      const result2 = await adapter.has(testKey);
      const result3 = await adapter.has(testKey);

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(result3).toBe(true);
      expect(mockRedisClient.exists).toHaveBeenCalledTimes(3);
    });

    test("should handle existence check immediately after set", async () => {
      mockRedisClient.set.mockResolvedValue();
      await adapter.set(testKey, testValue);

      mockRedisClient.exists.mockResolvedValue(true);
      const result = await adapter.has(testKey);

      expect(result).toBe(true);
      expect(mockRedisClient.exists).toHaveBeenCalledWith(`cache:${testKey}`);
    });

    test("should handle empty string key", async () => {
      mockRedisClient.exists.mockResolvedValue(false);

      const result = await adapter.has("");
      expect(result).toBe(false);
      expect(mockRedisClient.exists).toHaveBeenCalledWith("cache:");
    });

    test("should handle key with special characters", async () => {
      const specialKey = "key:with:colons-and_underscores.dots@symbols";
      mockRedisClient.exists.mockResolvedValue(true);

      const result = await adapter.has(specialKey);
      expect(result).toBe(true);
      expect(mockRedisClient.exists).toHaveBeenCalledWith(`cache:${specialKey}`);
    });

    test("should handle very long key names", async () => {
      const longKey = "a".repeat(1000);
      mockRedisClient.exists.mockResolvedValue(true);

      const result = await adapter.has(longKey);
      expect(result).toBe(true);
      expect(mockRedisClient.exists).toHaveBeenCalledWith(`cache:${longKey}`);
    });

    test("should handle Unicode key names", async () => {
      const unicodeKey = "测试键名🔑";
      mockRedisClient.exists.mockResolvedValue(true);

      const result = await adapter.has(unicodeKey);
      expect(result).toBe(true);
      expect(mockRedisClient.exists).toHaveBeenCalledWith(`cache:${unicodeKey}`);
    });

    test("should check existence of previously set key", async () => {
      mockRedisClient.set.mockResolvedValue();
      await adapter.set(testKey, testValue);

      mockRedisClient.exists.mockResolvedValue(true);
      const result = await adapter.has(testKey);
      expect(result).toBe(true);
    });

    test("should check existence of previously deleted key", async () => {
      mockRedisClient.del.mockResolvedValue(1);
      await adapter.delete(testKey);

      mockRedisClient.exists.mockResolvedValue(false);
      const result = await adapter.has(testKey);
      expect(result).toBe(false);
    });

    test("should throw on Redis error", async () => {
      mockRedisClient.exists.mockRejectedValue(new Error("Redis exists failed"));

      expect(adapter.has(testKey)).rejects.toThrow("Redis exists failed");
    });

    test("should throw on Redis connection error", async () => {
      mockRedisClient.exists.mockRejectedValue(new Error("ECONNREFUSED"));

      expect(adapter.has(testKey)).rejects.toThrow("ECONNREFUSED");
    });

    test("should throw on Redis timeout", async () => {
      mockRedisClient.exists.mockRejectedValue(new Error("Command timed out"));

      expect(adapter.has(testKey)).rejects.toThrow("Command timed out");
    });
  });

  describe("deleteByPrefix method", () => {
    test("should scan and delete keys matching prefix", async () => {
      mockRedisClient.scan.mockResolvedValueOnce(["0", ["cache:user:1", "cache:user:2"]]);
      mockRedisClient.del.mockResolvedValue(2);

      const result = await adapter.deleteByPrefix("user:");

      expect(result).toBe(2);
      expect(mockRedisClient.scan).toHaveBeenCalledWith("0", "MATCH", "cache:user:*", "COUNT", 100);
      expect(mockRedisClient.del).toHaveBeenCalledWith("cache:user:1", "cache:user:2");
    });

    test("should handle multiple scan iterations", async () => {
      mockRedisClient.scan
        .mockResolvedValueOnce(["42", ["cache:user:1", "cache:user:2"]])
        .mockResolvedValueOnce(["0", ["cache:user:3"]]);
      mockRedisClient.del.mockResolvedValue(1);

      const result = await adapter.deleteByPrefix("user:");

      expect(result).toBe(3);
      expect(mockRedisClient.scan).toHaveBeenCalledTimes(2);
      expect(mockRedisClient.del).toHaveBeenCalledTimes(2);
    });

    test("should return 0 when no keys match", async () => {
      mockRedisClient.scan.mockResolvedValueOnce(["0", []]);

      const result = await adapter.deleteByPrefix("nonexistent:");

      expect(result).toBe(0);
      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });

    test("should use namespace in pattern", async () => {
      mockRedisClient.scan.mockResolvedValueOnce(["0", []]);

      await adapter.deleteByPrefix("session:");

      expect(mockRedisClient.scan).toHaveBeenCalledWith("0", "MATCH", "cache:session:*", "COUNT", 100);
    });

    test("should throw on Redis error", async () => {
      mockRedisClient.scan.mockRejectedValue(new Error("Redis scan failed"));

      expect(adapter.deleteByPrefix("user:")).rejects.toThrow("Redis scan failed");
    });
  });

  describe("clear method", () => {
    test("should scan and delete all namespaced keys", async () => {
      mockRedisClient.scan.mockResolvedValueOnce(["0", ["cache:key1", "cache:key2"]]);
      mockRedisClient.del.mockResolvedValue(2);

      await adapter.clear();

      expect(mockRedisClient.scan).toHaveBeenCalledWith("0", "MATCH", "cache:*", "COUNT", 100);
      expect(mockRedisClient.del).toHaveBeenCalledWith("cache:key1", "cache:key2");
    });

    test("should handle multiple scan iterations", async () => {
      mockRedisClient.scan
        .mockResolvedValueOnce(["42", ["cache:key1", "cache:key2"]])
        .mockResolvedValueOnce(["0", ["cache:key3"]]);
      mockRedisClient.del.mockResolvedValue(1);

      await adapter.clear();

      expect(mockRedisClient.scan).toHaveBeenCalledTimes(2);
      expect(mockRedisClient.del).toHaveBeenCalledTimes(2);
      expect(mockRedisClient.del).toHaveBeenCalledWith("cache:key1", "cache:key2");
      expect(mockRedisClient.del).toHaveBeenCalledWith("cache:key3");
    });

    test("should handle empty scan result", async () => {
      mockRedisClient.scan.mockResolvedValueOnce(["0", []]);

      await adapter.clear();

      expect(mockRedisClient.scan).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });

    test("should throw on Redis error", async () => {
      mockRedisClient.scan.mockRejectedValue(new Error("Redis scan failed"));

      expect(adapter.clear()).rejects.toThrow("Redis scan failed");
    });
  });

  describe("client lifecycle", () => {
    test("should use the same client for multiple calls", async () => {
      mockRedisClient.get.mockResolvedValue(testValue);

      await adapter.get(testKey);
      await adapter.get(testKey);
      await adapter.get(testKey);

      expect(mockRedisClient.get).toHaveBeenCalledTimes(3);
    });
  });

  describe("delete and has methods integration", () => {
    test("should return false when checking existence after deletion", async () => {
      mockRedisClient.set.mockResolvedValue();
      await adapter.set(testKey, testValue);

      mockRedisClient.exists.mockResolvedValue(true);
      let exists = await adapter.has(testKey);
      expect(exists).toBe(true);

      mockRedisClient.del.mockResolvedValue(1);
      const deleted = await adapter.delete(testKey);
      expect(deleted).toBe(true);

      mockRedisClient.exists.mockResolvedValue(false);
      exists = await adapter.has(testKey);
      expect(exists).toBe(false);
    });

    test("should handle delete and has operations on same non-existent key", async () => {
      const nonExistentKey = "does-not-exist";

      mockRedisClient.exists.mockResolvedValue(false);
      const exists = await adapter.has(nonExistentKey);
      expect(exists).toBe(false);

      mockRedisClient.del.mockResolvedValue(0);
      const deleted = await adapter.delete(nonExistentKey);
      expect(deleted).toBe(false);

      mockRedisClient.exists.mockResolvedValue(false);
      const stillExists = await adapter.has(nonExistentKey);
      expect(stillExists).toBe(false);
    });

    test("should handle concurrent delete and has operations", async () => {
      const key1 = "concurrent-key-1";
      const key2 = "concurrent-key-2";

      mockRedisClient.exists.mockImplementation(async (key: string) => key === `cache:${key1}`);
      mockRedisClient.del.mockImplementation(async (key: string) => (key === `cache:${key1}` ? 1 : 0));

      const [exists1, exists2, deleted1, deleted2] = await Promise.all([
        adapter.has(key1),
        adapter.has(key2),
        adapter.delete(key1),
        adapter.delete(key2),
      ]);

      expect(exists1).toBe(true);
      expect(exists2).toBe(false);
      expect(deleted1).toBe(true);
      expect(deleted2).toBe(false);
    });

    test("should handle bulk operations with mixed existing and non-existing keys", async () => {
      const existingKeys = ["existing-1", "existing-2"];
      const nonExistingKeys = ["non-existing-1", "non-existing-2"];
      const allKeys = [...existingKeys, ...nonExistingKeys];

      const namespacedExistingKeys = existingKeys.map((k) => `cache:${k}`);
      mockRedisClient.exists.mockImplementation(async (key: string) => namespacedExistingKeys.includes(key));
      mockRedisClient.del.mockImplementation(async (key: string) => (namespacedExistingKeys.includes(key) ? 1 : 0));

      const existenceResults = await Promise.all(allKeys.map((key) => adapter.has(key)));

      const deleteResults = await Promise.all(allKeys.map((key) => adapter.delete(key)));

      expect(existenceResults).toEqual([true, true, false, false]);
      expect(deleteResults).toEqual([true, true, false, false]);
    });
  });
});
