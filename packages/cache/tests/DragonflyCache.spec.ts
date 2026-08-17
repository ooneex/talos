import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@talosjs/app-env";
import { CacheException, DragonflyCache } from "@/index";

// Default options that the adapter uses
const defaultOptions = {
  connectionTimeout: 10_000,
  idleTimeout: 0,
  autoReconnect: true,
  maxRetries: 10,
  enableOfflineQueue: true,
  enableAutoPipelining: true,
};

const mockDragonflyClient = {
  get: mock(async (_key: string): Promise<string | null> => null),
  set: mock(async (_key: string, _value: string, ..._options: (string | number)[]): Promise<"OK"> => "OK"),
  unlink: mock(async (..._keys: string[]): Promise<number> => 1),
  exists: mock(async (_key: string): Promise<boolean> => false),
  scan: mock(async (_cursor: string | number, ..._args: (string | number)[]): Promise<[string, string[]]> => ["0", []]),
};

const MockRedisClient = mock(() => mockDragonflyClient);

const originalRedisClient = Bun.RedisClient;

(Bun as { RedisClient: unknown }).RedisClient = MockRedisClient;

const scanArgs = (pattern: string, count = 1000): (string | number)[] => [
  "MATCH",
  pattern,
  "COUNT",
  count,
  "TYPE",
  "string",
];

describe("DragonflyCache", () => {
  let adapter: DragonflyCache;
  const testKey = "test-key";
  const testValue = "test-value";

  beforeAll(() => {
    Bun.env.CACHE_DRAGONFLY_URL = "redis://localhost:6379";
  });

  afterAll(() => {
    delete Bun.env.CACHE_DRAGONFLY_URL;
    (Bun as { RedisClient: unknown }).RedisClient = originalRedisClient;
  });

  beforeEach(() => {
    adapter = new DragonflyCache(new AppEnv(), {
      connectionString: "redis://localhost:6379/1",
    });

    for (const mockFn of [
      mockDragonflyClient.get,
      mockDragonflyClient.set,
      mockDragonflyClient.unlink,
      mockDragonflyClient.exists,
      mockDragonflyClient.scan,
      MockRedisClient,
    ]) {
      mockFn.mockClear();
    }

    mockDragonflyClient.get.mockImplementation(async (_key: string): Promise<string | null> => null);
    mockDragonflyClient.set.mockImplementation(
      async (_key: string, _value: string, ..._options: (string | number)[]): Promise<"OK"> => "OK",
    );
    mockDragonflyClient.unlink.mockImplementation(async (..._keys: string[]): Promise<number> => 1);
    mockDragonflyClient.exists.mockImplementation(async (_key: string): Promise<boolean> => false);
    mockDragonflyClient.scan.mockImplementation(
      async (_cursor: string | number, ..._args: (string | number)[]): Promise<[string, string[]]> => ["0", []],
    );
  });

  describe("constructor", () => {
    test("should create the client with connection string and default options", () => {
      new DragonflyCache(new AppEnv(), { connectionString: "redis://dragonfly:6379/2" });

      expect(MockRedisClient).toHaveBeenCalledWith("redis://dragonfly:6379/2", defaultOptions);
    });

    test("should use the connection string from the environment", () => {
      new DragonflyCache(new AppEnv());

      expect(MockRedisClient).toHaveBeenCalledWith("redis://localhost:6379", defaultOptions);
    });

    test("should merge additional client options with defaults", () => {
      new DragonflyCache(new AppEnv(), {
        connectionString: "redis://localhost:6379",
        connectionTimeout: 5000,
      });

      expect(MockRedisClient).toHaveBeenCalledWith("redis://localhost:6379", {
        ...defaultOptions,
        connectionTimeout: 5000,
      });
    });

    test("should not forward adapter-only options to the client", () => {
      new DragonflyCache(new AppEnv(), {
        connectionString: "redis://localhost:6379",
        namespace: "app",
        scanCount: 250,
      });

      expect(MockRedisClient).toHaveBeenCalledWith("redis://localhost:6379", defaultOptions);
    });

    test("should throw when no connection string is available", () => {
      const original = Bun.env.CACHE_DRAGONFLY_URL;
      delete Bun.env.CACHE_DRAGONFLY_URL;

      expect(() => new DragonflyCache(new AppEnv())).toThrow(CacheException);

      if (original) {
        Bun.env.CACHE_DRAGONFLY_URL = original;
      }
    });
  });

  describe("get method", () => {
    test("should return undefined for a missing key", async () => {
      mockDragonflyClient.get.mockResolvedValue(null);

      expect(await adapter.get("missing")).toBeUndefined();
      expect(mockDragonflyClient.get).toHaveBeenCalledWith("cache:missing");
    });

    test("should deserialize JSON values", async () => {
      const objectValue = { name: "test", tags: ["a", "b"], active: true };
      mockDragonflyClient.get.mockResolvedValue(JSON.stringify(objectValue));

      expect(await adapter.get<typeof objectValue>(testKey)).toEqual(objectValue);
    });

    test("should return the raw string when it is not valid JSON", async () => {
      mockDragonflyClient.get.mockResolvedValue("not-valid-json{");

      expect(await adapter.get<string>(testKey)).toBe("not-valid-json{");
    });

    test("should propagate client errors", async () => {
      mockDragonflyClient.get.mockRejectedValue(new Error("Dragonfly connection failed"));

      expect(adapter.get(testKey)).rejects.toThrow("Dragonfly connection failed");
    });
  });

  describe("set method", () => {
    test("should store a string value without serializing it", async () => {
      await adapter.set(testKey, testValue);

      expect(mockDragonflyClient.set).toHaveBeenCalledWith(`cache:${testKey}`, testValue);
    });

    test("should serialize non-string values", async () => {
      await adapter.set(testKey, { count: 5 });

      expect(mockDragonflyClient.set).toHaveBeenCalledWith(`cache:${testKey}`, JSON.stringify({ count: 5 }));
    });

    test("should store undefined as null", async () => {
      await adapter.set(testKey, undefined);

      expect(mockDragonflyClient.set).toHaveBeenCalledWith(`cache:${testKey}`, "null");
    });

    test("should set the TTL atomically with the value", async () => {
      await adapter.set(testKey, testValue, 60);

      expect(mockDragonflyClient.set).toHaveBeenCalledWith(`cache:${testKey}`, testValue, "EX", 60);
      expect(mockDragonflyClient.set).toHaveBeenCalledTimes(1);
    });

    test("should floor a fractional TTL", async () => {
      await adapter.set(testKey, testValue, 10.9);

      expect(mockDragonflyClient.set).toHaveBeenCalledWith(`cache:${testKey}`, testValue, "EX", 10);
    });

    test("should ignore a zero TTL", async () => {
      await adapter.set(testKey, testValue, 0);

      expect(mockDragonflyClient.set).toHaveBeenCalledWith(`cache:${testKey}`, testValue);
    });

    test("should propagate client errors", async () => {
      mockDragonflyClient.set.mockRejectedValue(new Error("Dragonfly write failed"));

      expect(adapter.set(testKey, testValue)).rejects.toThrow("Dragonfly write failed");
    });
  });

  describe("delete method", () => {
    test("should unlink the namespaced key and report success", async () => {
      mockDragonflyClient.unlink.mockResolvedValue(1);

      expect(await adapter.delete(testKey)).toBe(true);
      expect(mockDragonflyClient.unlink).toHaveBeenCalledWith(`cache:${testKey}`);
    });

    test("should return false when nothing was removed", async () => {
      mockDragonflyClient.unlink.mockResolvedValue(0);

      expect(await adapter.delete("missing")).toBe(false);
    });

    test("should propagate client errors", async () => {
      mockDragonflyClient.unlink.mockRejectedValue(new Error("Dragonfly delete failed"));

      expect(adapter.delete(testKey)).rejects.toThrow("Dragonfly delete failed");
    });
  });

  describe("has method", () => {
    test("should report an existing key", async () => {
      mockDragonflyClient.exists.mockResolvedValue(true);

      expect(await adapter.has(testKey)).toBe(true);
      expect(mockDragonflyClient.exists).toHaveBeenCalledWith(`cache:${testKey}`);
    });

    test("should report a missing key", async () => {
      mockDragonflyClient.exists.mockResolvedValue(false);

      expect(await adapter.has(testKey)).toBe(false);
    });
  });

  describe("deleteByPrefix method", () => {
    test("should scan strings only and unlink matching keys", async () => {
      mockDragonflyClient.scan.mockResolvedValueOnce(["0", ["cache:user:1", "cache:user:2"]]);
      mockDragonflyClient.unlink.mockResolvedValue(2);

      expect(await adapter.deleteByPrefix("user:")).toBe(2);
      expect(mockDragonflyClient.scan).toHaveBeenCalledWith("0", ...scanArgs("cache:user:*"));
      expect(mockDragonflyClient.unlink).toHaveBeenCalledWith("cache:user:1", "cache:user:2");
    });

    test("should follow the cursor across pages", async () => {
      mockDragonflyClient.scan
        .mockResolvedValueOnce(["42", ["cache:user:1", "cache:user:2"]])
        .mockResolvedValueOnce(["7", []])
        .mockResolvedValueOnce(["0", ["cache:user:3"]]);
      mockDragonflyClient.unlink.mockResolvedValueOnce(2).mockResolvedValueOnce(1);

      expect(await adapter.deleteByPrefix("user:")).toBe(3);
      expect(mockDragonflyClient.scan).toHaveBeenCalledTimes(3);
      expect(mockDragonflyClient.unlink).toHaveBeenCalledTimes(2);
    });

    test("should count what the server removed, not what the scan returned", async () => {
      mockDragonflyClient.scan
        .mockResolvedValueOnce(["9", ["cache:user:1"]])
        .mockResolvedValueOnce(["0", ["cache:user:1"]]);
      mockDragonflyClient.unlink.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

      expect(await adapter.deleteByPrefix("user:")).toBe(1);
    });

    test("should return 0 when nothing matches", async () => {
      mockDragonflyClient.scan.mockResolvedValueOnce(["0", []]);

      expect(await adapter.deleteByPrefix("nothing:")).toBe(0);
      expect(mockDragonflyClient.unlink).not.toHaveBeenCalled();
    });

    test("should honour a custom scan count", async () => {
      const custom = new DragonflyCache(new AppEnv(), {
        connectionString: "redis://localhost:6379",
        scanCount: 50,
      });
      mockDragonflyClient.scan.mockResolvedValueOnce(["0", []]);

      await custom.deleteByPrefix("user:");

      expect(mockDragonflyClient.scan).toHaveBeenCalledWith("0", ...scanArgs("cache:user:*", 50));
    });

    test("should drop the namespace prefix when the namespace is disabled", async () => {
      const custom = new DragonflyCache(new AppEnv(), {
        connectionString: "redis://localhost:6379",
        namespace: "",
      });
      mockDragonflyClient.scan.mockResolvedValueOnce(["0", []]);

      await custom.deleteByPrefix("user:");

      expect(mockDragonflyClient.scan).toHaveBeenCalledWith("0", ...scanArgs("user:*"));
    });

    test("should propagate client errors", async () => {
      mockDragonflyClient.scan.mockRejectedValue(new Error("Dragonfly scan failed"));

      expect(adapter.deleteByPrefix("user:")).rejects.toThrow("Dragonfly scan failed");
    });
  });

  describe("clear method", () => {
    test("should unlink every namespaced key", async () => {
      mockDragonflyClient.scan.mockResolvedValueOnce(["0", ["cache:key1", "cache:key2"]]);
      mockDragonflyClient.unlink.mockResolvedValue(2);

      await adapter.clear();

      expect(mockDragonflyClient.scan).toHaveBeenCalledWith("0", ...scanArgs("cache:*"));
      expect(mockDragonflyClient.unlink).toHaveBeenCalledWith("cache:key1", "cache:key2");
    });

    test("should do nothing when the namespace is empty", async () => {
      mockDragonflyClient.scan.mockResolvedValueOnce(["0", []]);

      await adapter.clear();

      expect(mockDragonflyClient.unlink).not.toHaveBeenCalled();
    });

    test("should propagate client errors", async () => {
      mockDragonflyClient.scan.mockRejectedValue(new Error("Dragonfly scan failed"));

      expect(adapter.clear()).rejects.toThrow("Dragonfly scan failed");
    });
  });
});
