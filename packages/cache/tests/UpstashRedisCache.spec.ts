import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@talosjs/app-env";
import { CacheException, UpstashRedisCache } from "@/index";

// Create mock pipeline instance
const mockPipeline = {
  del: mock((_key: string) => mockPipeline),
  exec: mock(async () => []),
};

// Create mock Redis client instance
const mockRedisClient = {
  get: mock(async <T>(_key: string): Promise<T | null> => null),
  set: mock(async (_key: string, _value: unknown, _opts?: { ex?: number }): Promise<string> => "OK"),
  del: mock(async (_key: string): Promise<number> => 1),
  exists: mock(async (_key: string): Promise<number> => 0),
  scan: mock(async (_cursor: string | number, _opts?: object): Promise<[string, string[]]> => ["0", []]),
  pipeline: mock(() => mockPipeline),
};

// Mock the @upstash/redis module
mock.module("@upstash/redis", () => ({
  Redis: class MockRedis {
    get = mockRedisClient.get;
    set = mockRedisClient.set;
    del = mockRedisClient.del;
    exists = mockRedisClient.exists;
    scan = mockRedisClient.scan;
    pipeline = mockRedisClient.pipeline;
  },
}));

describe("UpstashRedisCache", () => {
  let adapter: UpstashRedisCache;
  const testKey = "test-key";
  const testValue = "test-value";

  beforeEach(() => {
    adapter = new UpstashRedisCache(new AppEnv(), {
      url: "https://test.upstash.io",
      token: "test-token",
    });

    // Reset all mocks
    const mocksToReset = [
      mockRedisClient.get,
      mockRedisClient.set,
      mockRedisClient.del,
      mockRedisClient.exists,
      mockRedisClient.scan,
      mockRedisClient.pipeline,
      mockPipeline.del,
      mockPipeline.exec,
    ];

    mocksToReset.forEach((mockFn) => {
      if (mockFn && typeof mockFn.mockClear === "function") {
        mockFn.mockClear();
      }
    });

    // Reset mock implementations to defaults
    mockRedisClient.get.mockImplementation(async <T>(_key: string): Promise<T | null> => null);
    mockRedisClient.set.mockImplementation(
      async (_key: string, _value: unknown, _opts?: { ex?: number }): Promise<string> => "OK",
    );
    mockRedisClient.del.mockImplementation(async (_key: string): Promise<number> => 1);
    mockRedisClient.exists.mockImplementation(async (_key: string): Promise<number> => 0);
    mockRedisClient.scan.mockImplementation(
      async (_cursor: string | number, _opts?: object): Promise<[string, string[]]> => ["0", []],
    );
    mockRedisClient.pipeline.mockImplementation(() => mockPipeline);
    mockPipeline.del.mockImplementation((_key: string) => mockPipeline);
    mockPipeline.exec.mockImplementation(async () => []);
  });

  describe("constructor", () => {
    test("should create client with url and token from options", () => {
      const cache = new UpstashRedisCache(new AppEnv(), {
        url: "https://example.upstash.io",
        token: "my-token",
      });

      expect(cache).toBeInstanceOf(UpstashRedisCache);
    });

    test("should use environment variables when options are not provided", () => {
      const originalUrl = Bun.env.CACHE_UPSTASH_REDIS_REST_URL;
      const originalToken = Bun.env.CACHE_UPSTASH_REDIS_REST_TOKEN;

      Bun.env.CACHE_UPSTASH_REDIS_REST_URL = "https://env.upstash.io";
      Bun.env.CACHE_UPSTASH_REDIS_REST_TOKEN = "env-token";

      const cache = new UpstashRedisCache(new AppEnv());
      expect(cache).toBeInstanceOf(UpstashRedisCache);

      if (originalUrl) {
        Bun.env.CACHE_UPSTASH_REDIS_REST_URL = originalUrl;
      } else {
        delete Bun.env.CACHE_UPSTASH_REDIS_REST_URL;
      }

      if (originalToken) {
        Bun.env.CACHE_UPSTASH_REDIS_REST_TOKEN = originalToken;
      } else {
        delete Bun.env.CACHE_UPSTASH_REDIS_REST_TOKEN;
      }
    });

    test("should throw CacheException when url is missing", () => {
      const originalUrl = Bun.env.CACHE_UPSTASH_REDIS_REST_URL;
      delete Bun.env.CACHE_UPSTASH_REDIS_REST_URL;

      expect(() => new UpstashRedisCache(new AppEnv())).toThrow(CacheException);
      expect(() => new UpstashRedisCache(new AppEnv())).toThrow("Upstash Redis REST URL is required");

      if (originalUrl) {
        Bun.env.CACHE_UPSTASH_REDIS_REST_URL = originalUrl;
      }
    });

    test("should throw CacheException when token is missing", () => {
      const originalToken = Bun.env.CACHE_UPSTASH_REDIS_REST_TOKEN;
      delete Bun.env.CACHE_UPSTASH_REDIS_REST_TOKEN;

      expect(() => new UpstashRedisCache(new AppEnv(), { url: "https://test.upstash.io" })).toThrow(CacheException);
      expect(() => new UpstashRedisCache(new AppEnv(), { url: "https://test.upstash.io" })).toThrow(
        "Upstash Redis REST token is required",
      );

      if (originalToken) {
        Bun.env.CACHE_UPSTASH_REDIS_REST_TOKEN = originalToken;
      }
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
      mockRedisClient.get.mockResolvedValue(42);

      const result = await adapter.get<number>(testKey);
      expect(result).toBe(42);
    });

    test("should retrieve boolean value", async () => {
      mockRedisClient.get.mockResolvedValue(true);

      const result = await adapter.get<boolean>(testKey);
      expect(result).toBe(true);
    });

    test("should retrieve object value", async () => {
      const objectValue = { name: "test", age: 25, active: true };
      mockRedisClient.get.mockResolvedValue(objectValue);

      const result = await adapter.get<typeof objectValue>(testKey);
      expect(result).toEqual(objectValue);
    });

    test("should retrieve array value", async () => {
      const arrayValue = [1, 2, 3, "test", { nested: true }];
      mockRedisClient.get.mockResolvedValue(arrayValue);

      const result = await adapter.get<typeof arrayValue>(testKey);
      expect(result).toEqual(arrayValue);
    });

    test("should retrieve null value", async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await adapter.get(testKey);
      expect(result).toBeUndefined();
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
      mockRedisClient.get.mockResolvedValue(complexObject);

      const result = await adapter.get<typeof complexObject>(testKey);
      expect(result).toEqual(complexObject);
    });

    test("should throw on error", async () => {
      mockRedisClient.get.mockRejectedValue(new Error("Upstash connection failed"));

      expect(adapter.get(testKey)).rejects.toThrow(Error);
      expect(adapter.get(testKey)).rejects.toThrow("Upstash connection failed");
    });
  });

  describe("set method", () => {
    test("should store string value", async () => {
      await adapter.set(testKey, testValue);

      expect(mockRedisClient.set).toHaveBeenCalledWith(`cache:${testKey}`, testValue);
    });

    test("should store number value", async () => {
      await adapter.set(testKey, 123.45);

      expect(mockRedisClient.set).toHaveBeenCalledWith(`cache:${testKey}`, 123.45);
    });

    test("should store boolean value", async () => {
      await adapter.set(testKey, false);

      expect(mockRedisClient.set).toHaveBeenCalledWith(`cache:${testKey}`, false);
    });

    test("should store object value", async () => {
      const objectValue = { message: "hello", count: 5 };
      await adapter.set(testKey, objectValue);

      expect(mockRedisClient.set).toHaveBeenCalledWith(`cache:${testKey}`, objectValue);
    });

    test("should store array value", async () => {
      const arrayValue = ["a", "b", "c"];
      await adapter.set(testKey, arrayValue);

      expect(mockRedisClient.set).toHaveBeenCalledWith(`cache:${testKey}`, arrayValue);
    });

    test("should store value with TTL", async () => {
      const ttlSeconds = 2;
      await adapter.set(testKey, testValue, ttlSeconds);

      expect(mockRedisClient.set).toHaveBeenCalledWith(`cache:${testKey}`, testValue, { ex: ttlSeconds });
    });

    test("should handle empty string value", async () => {
      await adapter.set(testKey, "");

      expect(mockRedisClient.set).toHaveBeenCalledWith(`cache:${testKey}`, "");
    });

    test("should handle zero as value", async () => {
      await adapter.set(testKey, 0);

      expect(mockRedisClient.set).toHaveBeenCalledWith(`cache:${testKey}`, 0);
    });

    test("should handle null as value", async () => {
      await adapter.set(testKey, null);

      expect(mockRedisClient.set).toHaveBeenCalledWith(`cache:${testKey}`, null);
    });

    test("should handle undefined value (should serialize as null)", async () => {
      await adapter.set(testKey, undefined);

      expect(mockRedisClient.set).toHaveBeenCalledWith(`cache:${testKey}`, null);
    });

    test("should set value with zero TTL (should behave as no TTL)", async () => {
      await adapter.set(testKey, testValue, 0);

      expect(mockRedisClient.set).toHaveBeenCalledWith(`cache:${testKey}`, testValue);
    });

    test("should throw on error", async () => {
      mockRedisClient.set.mockRejectedValue(new Error("Upstash write failed"));

      expect(adapter.set(testKey, testValue)).rejects.toThrow(Error);
      expect(adapter.set(testKey, testValue)).rejects.toThrow("Upstash write failed");
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

    test("should throw on error", async () => {
      mockRedisClient.del.mockRejectedValue(new Error("Upstash delete failed"));

      expect(adapter.delete(testKey)).rejects.toThrow("Upstash delete failed");
    });

    test("should throw on connection error", async () => {
      mockRedisClient.del.mockRejectedValue(new Error("ECONNREFUSED"));

      expect(adapter.delete(testKey)).rejects.toThrow("ECONNREFUSED");
    });

    test("should throw on timeout", async () => {
      mockRedisClient.del.mockRejectedValue(new Error("Command timed out"));

      expect(adapter.delete(testKey)).rejects.toThrow("Command timed out");
    });
  });

  describe("has method", () => {
    test("should return true for existing key", async () => {
      mockRedisClient.exists.mockResolvedValue(1);

      const result = await adapter.has(testKey);
      expect(result).toBe(true);
      expect(mockRedisClient.exists).toHaveBeenCalledWith(`cache:${testKey}`);
    });

    test("should return false for non-existent key", async () => {
      mockRedisClient.exists.mockResolvedValue(0);

      const result = await adapter.has("non-existent");
      expect(result).toBe(false);
    });

    test("should handle repeated existence checks on same key", async () => {
      mockRedisClient.exists.mockResolvedValue(1);

      const result1 = await adapter.has(testKey);
      const result2 = await adapter.has(testKey);
      const result3 = await adapter.has(testKey);

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(result3).toBe(true);
      expect(mockRedisClient.exists).toHaveBeenCalledTimes(3);
    });

    test("should handle existence check immediately after set", async () => {
      mockRedisClient.set.mockResolvedValue("OK");
      await adapter.set(testKey, testValue);

      mockRedisClient.exists.mockResolvedValue(1);
      const result = await adapter.has(testKey);

      expect(result).toBe(true);
      expect(mockRedisClient.exists).toHaveBeenCalledWith(`cache:${testKey}`);
    });

    test("should handle empty string key", async () => {
      mockRedisClient.exists.mockResolvedValue(0);

      const result = await adapter.has("");
      expect(result).toBe(false);
      expect(mockRedisClient.exists).toHaveBeenCalledWith("cache:");
    });

    test("should handle key with special characters", async () => {
      const specialKey = "key:with:colons-and_underscores.dots@symbols";
      mockRedisClient.exists.mockResolvedValue(1);

      const result = await adapter.has(specialKey);
      expect(result).toBe(true);
      expect(mockRedisClient.exists).toHaveBeenCalledWith(`cache:${specialKey}`);
    });

    test("should handle very long key names", async () => {
      const longKey = "a".repeat(1000);
      mockRedisClient.exists.mockResolvedValue(1);

      const result = await adapter.has(longKey);
      expect(result).toBe(true);
      expect(mockRedisClient.exists).toHaveBeenCalledWith(`cache:${longKey}`);
    });

    test("should handle Unicode key names", async () => {
      const unicodeKey = "测试键名🔑";
      mockRedisClient.exists.mockResolvedValue(1);

      const result = await adapter.has(unicodeKey);
      expect(result).toBe(true);
      expect(mockRedisClient.exists).toHaveBeenCalledWith(`cache:${unicodeKey}`);
    });

    test("should check existence of previously deleted key", async () => {
      mockRedisClient.del.mockResolvedValue(1);
      await adapter.delete(testKey);

      mockRedisClient.exists.mockResolvedValue(0);
      const result = await adapter.has(testKey);
      expect(result).toBe(false);
    });

    test("should throw on error", async () => {
      mockRedisClient.exists.mockRejectedValue(new Error("Upstash exists failed"));

      expect(adapter.has(testKey)).rejects.toThrow("Upstash exists failed");
    });

    test("should throw on connection error", async () => {
      mockRedisClient.exists.mockRejectedValue(new Error("ECONNREFUSED"));

      expect(adapter.has(testKey)).rejects.toThrow("ECONNREFUSED");
    });

    test("should throw on timeout", async () => {
      mockRedisClient.exists.mockRejectedValue(new Error("Command timed out"));

      expect(adapter.has(testKey)).rejects.toThrow("Command timed out");
    });
  });

  describe("deleteByPrefix method", () => {
    test("should scan and delete keys matching prefix", async () => {
      mockRedisClient.scan.mockResolvedValueOnce(["0", ["cache:user:1", "cache:user:2"]]);

      const result = await adapter.deleteByPrefix("user:");

      expect(result).toBe(2);
      expect(mockRedisClient.scan).toHaveBeenCalledWith("0", { match: "cache:user:*", count: 100 });
      expect(mockRedisClient.pipeline).toHaveBeenCalledTimes(1);
      expect(mockPipeline.del).toHaveBeenCalledWith("cache:user:1");
      expect(mockPipeline.del).toHaveBeenCalledWith("cache:user:2");
      expect(mockPipeline.exec).toHaveBeenCalledTimes(1);
    });

    test("should handle multiple scan iterations", async () => {
      mockRedisClient.scan
        .mockResolvedValueOnce(["42", ["cache:user:1", "cache:user:2"]])
        .mockResolvedValueOnce(["0", ["cache:user:3"]]);

      const result = await adapter.deleteByPrefix("user:");

      expect(result).toBe(3);
      expect(mockRedisClient.scan).toHaveBeenCalledTimes(2);
      expect(mockRedisClient.pipeline).toHaveBeenCalledTimes(2);
      expect(mockPipeline.del).toHaveBeenCalledTimes(3);
      expect(mockPipeline.exec).toHaveBeenCalledTimes(2);
    });

    test("should return 0 when no keys match", async () => {
      mockRedisClient.scan.mockResolvedValueOnce(["0", []]);

      const result = await adapter.deleteByPrefix("nonexistent:");

      expect(result).toBe(0);
      expect(mockRedisClient.pipeline).not.toHaveBeenCalled();
    });

    test("should use namespace in pattern", async () => {
      mockRedisClient.scan.mockResolvedValueOnce(["0", []]);

      await adapter.deleteByPrefix("session:");

      expect(mockRedisClient.scan).toHaveBeenCalledWith("0", { match: "cache:session:*", count: 100 });
    });

    test("should throw on scan error", async () => {
      mockRedisClient.scan.mockRejectedValue(new Error("Upstash scan failed"));

      expect(adapter.deleteByPrefix("user:")).rejects.toThrow("Upstash scan failed");
    });
  });

  describe("clear method", () => {
    test("should scan and delete all namespaced keys", async () => {
      mockRedisClient.scan.mockResolvedValueOnce(["0", ["cache:key1", "cache:key2"]]);

      await adapter.clear();

      expect(mockRedisClient.scan).toHaveBeenCalledWith("0", { match: "cache:*", count: 100 });
      expect(mockRedisClient.pipeline).toHaveBeenCalledTimes(1);
      expect(mockPipeline.del).toHaveBeenCalledWith("cache:key1");
      expect(mockPipeline.del).toHaveBeenCalledWith("cache:key2");
      expect(mockPipeline.exec).toHaveBeenCalledTimes(1);
    });

    test("should handle multiple scan iterations", async () => {
      mockRedisClient.scan
        .mockResolvedValueOnce(["42", ["cache:key1", "cache:key2"]])
        .mockResolvedValueOnce(["0", ["cache:key3"]]);

      await adapter.clear();

      expect(mockRedisClient.scan).toHaveBeenCalledTimes(2);
      expect(mockRedisClient.pipeline).toHaveBeenCalledTimes(2);
      expect(mockPipeline.del).toHaveBeenCalledTimes(3);
      expect(mockPipeline.exec).toHaveBeenCalledTimes(2);
    });

    test("should handle empty scan result", async () => {
      mockRedisClient.scan.mockResolvedValueOnce(["0", []]);

      await adapter.clear();

      expect(mockRedisClient.scan).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.pipeline).not.toHaveBeenCalled();
    });

    test("should throw on scan error", async () => {
      mockRedisClient.scan.mockRejectedValue(new Error("Upstash scan failed"));

      expect(adapter.clear()).rejects.toThrow("Upstash scan failed");
    });
  });

  describe("delete and has methods integration", () => {
    test("should return false when checking existence after deletion", async () => {
      mockRedisClient.set.mockResolvedValue("OK");
      await adapter.set(testKey, testValue);

      mockRedisClient.exists.mockResolvedValue(1);
      let exists = await adapter.has(testKey);
      expect(exists).toBe(true);

      mockRedisClient.del.mockResolvedValue(1);
      const deleted = await adapter.delete(testKey);
      expect(deleted).toBe(true);

      mockRedisClient.exists.mockResolvedValue(0);
      exists = await adapter.has(testKey);
      expect(exists).toBe(false);
    });

    test("should handle delete and has operations on same non-existent key", async () => {
      const nonExistentKey = "does-not-exist";

      mockRedisClient.exists.mockResolvedValue(0);
      const exists = await adapter.has(nonExistentKey);
      expect(exists).toBe(false);

      mockRedisClient.del.mockResolvedValue(0);
      const deleted = await adapter.delete(nonExistentKey);
      expect(deleted).toBe(false);

      mockRedisClient.exists.mockResolvedValue(0);
      const stillExists = await adapter.has(nonExistentKey);
      expect(stillExists).toBe(false);
    });

    test("should handle concurrent delete and has operations", async () => {
      const key1 = "concurrent-key-1";
      const key2 = "concurrent-key-2";

      mockRedisClient.exists.mockImplementation(async (key: string) => (key === `cache:${key1}` ? 1 : 0));
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
      mockRedisClient.exists.mockImplementation(async (key: string) => (namespacedExistingKeys.includes(key) ? 1 : 0));
      mockRedisClient.del.mockImplementation(async (key: string) => (namespacedExistingKeys.includes(key) ? 1 : 0));

      const existenceResults = await Promise.all(allKeys.map((key) => adapter.has(key)));
      const deleteResults = await Promise.all(allKeys.map((key) => adapter.delete(key)));

      expect(existenceResults).toEqual([true, true, false, false]);
      expect(deleteResults).toEqual([true, true, false, false]);
    });
  });
});
