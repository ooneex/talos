import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CacheException, FilesystemCache } from "@/index";

describe("FilesystemCacheAdapter", () => {
  let adapter: FilesystemCache;
  const testKey = "test:key";
  const testValue = "test:value";
  const testCacheDir = join(tmpdir(), "talos-cache-test");

  beforeEach(() => {
    adapter = new FilesystemCache({
      cacheDir: testCacheDir,
    });
  });

  afterEach(async () => {
    try {
      // Clean up all cache files
      const glob = new Bun.Glob("*.cache");
      for await (const fileName of glob.scan({ cwd: testCacheDir })) {
        const file = Bun.file(`${testCacheDir}/${fileName}`);
        await file.delete().catch(() => {});
      }
    } catch {
      // Ignore errors during cleanup
    }
  });

  afterAll(async () => {
    try {
      await rmdir(testCacheDir, { recursive: true });
    } catch {
      // Directory might not exist
    }
  });

  describe("constructor", () => {
    test("should create FilesystemCacheAdapter with default options", () => {
      const defaultAdapter = new FilesystemCache();
      expect(defaultAdapter).toBeInstanceOf(FilesystemCache);
    });

    test("should create FilesystemCacheAdapter with custom options", () => {
      const options = {
        cacheDir: "/custom/cache",
        maxFileSize: 5 * 1024 * 1024,
      };
      const customAdapter = new FilesystemCache(options);
      expect(customAdapter).toBeInstanceOf(FilesystemCache);
    });
  });

  describe("get method", () => {
    test("should return undefined for non-existent key", async () => {
      const result = await adapter.get("non-existent-key");
      expect(result).toBeUndefined();
    });

    test("should retrieve string value", async () => {
      await adapter.set(testKey, testValue);
      const result = await adapter.get(testKey);
      expect(result).toBe(testValue);
    });

    test("should retrieve number value", async () => {
      const numberValue = 42;
      await adapter.set(testKey, numberValue);
      const result = await adapter.get(testKey);
      expect(result).toBe(numberValue);
    });

    test("should retrieve boolean value", async () => {
      const boolValue = true;
      await adapter.set(testKey, boolValue);
      const result = await adapter.get(testKey);
      expect(result).toBe(boolValue);
    });

    test("should retrieve object value", async () => {
      const objectValue = { name: "test", age: 25, active: true };
      await adapter.set(testKey, objectValue);
      const result = await adapter.get(testKey);
      expect(result).toEqual(objectValue);
    });

    test("should retrieve array value", async () => {
      const arrayValue = [1, 2, 3, { nested: true }];
      await adapter.set(testKey, arrayValue);
      const result = await adapter.get(testKey);
      expect(result).toEqual(arrayValue);
    });

    test("should retrieve null value", async () => {
      const nullValue = null;
      await adapter.set(testKey, nullValue);
      const result = await adapter.get(testKey);
      expect(result).toBe(nullValue);
    });

    test("should handle complex nested objects", async () => {
      const complexObject = {
        id: "user123",
        user: {
          name: "John Doe",
          preferences: {
            theme: "dark",
            notifications: true,
            tags: ["work", "personal"],
          },
        },
        metadata: {
          createdAt: "2023-01-01",
          version: "1.0",
        },
      };
      await adapter.set(testKey, complexObject);
      const result = await adapter.get(testKey);
      expect(result).toEqual(complexObject);
    });

    test("should return undefined for expired key", async () => {
      await adapter.set(testKey, testValue, 0.001); // 1ms TTL
      await new Promise((resolve) => setTimeout(resolve, 10)); // Wait for expiration
      const result = await adapter.get(testKey);
      expect(result).toBeUndefined();
    });

    test("should return undefined for corrupted cache file", async () => {
      // First ensure directory exists
      await adapter.set("temp", "temp");
      await adapter.delete("temp");

      // Create a corrupted cache file
      const filePath = `${testCacheDir}/corrupted.cache`;
      await Bun.write(filePath, "invalid json{");

      const result = await adapter.get("corrupted");
      expect(result).toBeUndefined();
    });
  });

  describe("set method", () => {
    test("should store string value", async () => {
      await adapter.set(testKey, testValue);
      const result = await adapter.get(testKey);
      expect(result).toBe(testValue);
    });

    test("should store number value", async () => {
      const numberValue = 42;
      await adapter.set(testKey, numberValue);
      const result = await adapter.get(testKey);
      expect(result).toBe(numberValue);
    });

    test("should store boolean value", async () => {
      const boolValue = false;
      await adapter.set(testKey, boolValue);
      const result = await adapter.get(testKey);
      expect(result).toBe(boolValue);
    });

    test("should store object value", async () => {
      const objectValue = { message: "hello", count: 10 };
      await adapter.set(testKey, objectValue);
      const result = await adapter.get(testKey);
      expect(result).toEqual(objectValue);
    });

    test("should store array value", async () => {
      const arrayValue = [1, "two", { three: 3 }];
      await adapter.set(testKey, arrayValue);
      const result = await adapter.get(testKey);
      expect(result).toEqual(arrayValue);
    });

    test("should store value with TTL", async () => {
      const ttlSeconds = 5;
      await adapter.set(testKey, testValue, ttlSeconds);
      const result = await adapter.get(testKey);
      expect(result).toBe(testValue);
    });

    test("should handle empty string value", async () => {
      const emptyString = "";
      await adapter.set(testKey, emptyString);
      const result = await adapter.get(testKey);
      expect(result).toBe(emptyString);
    });

    test("should handle zero as value", async () => {
      const zeroValue = 0;
      await adapter.set(testKey, zeroValue);
      const result = await adapter.get(testKey);
      expect(result).toBe(zeroValue);
    });

    test("should handle null as value", async () => {
      const nullValue = null;
      await adapter.set(testKey, nullValue);
      const result = await adapter.get(testKey);
      expect(result).toBe(nullValue);
    });

    test("should handle undefined value", async () => {
      const undefinedValue = undefined;
      await adapter.set(testKey, undefinedValue);
      const result = await adapter.get(testKey);
      expect(result).toBe(undefinedValue);
    });

    test("should overwrite existing value", async () => {
      await adapter.set(testKey, "original");
      await adapter.set(testKey, "updated");
      const result = await adapter.get(testKey);
      expect(result).toBe("updated");
    });

    test("should throw CacheException when exceeding max file size", async () => {
      const smallAdapter = new FilesystemCache({
        cacheDir: testCacheDir,
        maxFileSize: 100, // 100 bytes
      });

      const largeValue = "x".repeat(1000); // 1000 characters
      expect(smallAdapter.set(testKey, largeValue)).rejects.toThrow(CacheException);
    });
  });

  describe("delete method", () => {
    test("should delete existing key", async () => {
      await adapter.set(testKey, testValue);
      const result = await adapter.delete(testKey);
      expect(result).toBe(true);
      expect(await adapter.get(testKey)).toBeUndefined();
    });

    test("should return false for non-existent key", async () => {
      const result = await adapter.delete("non-existent-key");
      expect(result).toBe(false);
    });

    test("should handle empty string key", async () => {
      await adapter.set("", testValue);
      const result = await adapter.delete("");
      expect(result).toBe(true);
    });

    test("should handle key with special characters", async () => {
      const specialKey = "special:key@#$%^&*()";
      await adapter.set(specialKey, testValue);
      const result = await adapter.delete(specialKey);
      expect(result).toBe(true);
    });

    test("should handle very long key names", async () => {
      const longKey = "a".repeat(1000);
      await adapter.set(longKey, testValue);
      const result = await adapter.delete(longKey);
      expect(result).toBe(true);
    });

    test("should handle Unicode key names", async () => {
      const unicodeKey = "测试键名🔑";
      await adapter.set(unicodeKey, testValue);
      const result = await adapter.delete(unicodeKey);
      expect(result).toBe(true);
    });
  });

  describe("has method", () => {
    test("should return true for existing key", async () => {
      await adapter.set(testKey, testValue);
      const result = await adapter.has(testKey);
      expect(result).toBe(true);
    });

    test("should return false for non-existent key", async () => {
      const result = await adapter.has("non-existent-key");
      expect(result).toBe(false);
    });

    test("should return false for expired key", async () => {
      await adapter.set(testKey, testValue, 0.001); // 1ms TTL
      await new Promise((resolve) => setTimeout(resolve, 10)); // Wait for expiration
      const result = await adapter.has(testKey);
      expect(result).toBe(false);
    });

    test("should handle repeated existence checks on same key", async () => {
      await adapter.set(testKey, testValue);

      const result1 = await adapter.has(testKey);
      const result2 = await adapter.has(testKey);
      const result3 = await adapter.has(testKey);

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(result3).toBe(true);
    });

    test("should handle existence check immediately after set", async () => {
      await adapter.set(testKey, testValue);
      const result = await adapter.has(testKey);
      expect(result).toBe(true);
    });

    test("should handle empty string key", async () => {
      await adapter.set("", testValue);
      const result = await adapter.has("");
      expect(result).toBe(true);
    });

    test("should handle key with special characters", async () => {
      const specialKey = "special:key@#$%^&*()";
      await adapter.set(specialKey, testValue);
      const result = await adapter.has(specialKey);
      expect(result).toBe(true);
    });

    test("should handle very long key names", async () => {
      const longKey = "a".repeat(1000);
      await adapter.set(longKey, testValue);
      const result = await adapter.has(longKey);
      expect(result).toBe(true);
    });

    test("should handle Unicode key names", async () => {
      const unicodeKey = "测试键名🔑";
      await adapter.set(unicodeKey, testValue);
      const result = await adapter.has(unicodeKey);
      expect(result).toBe(true);
    });

    test("should check existence of previously set key", async () => {
      await adapter.set(testKey, testValue);
      await adapter.set("another:key", "another:value");

      const result = await adapter.has(testKey);
      expect(result).toBe(true);
    });

    test("should check existence of previously deleted key", async () => {
      await adapter.set(testKey, testValue);
      await adapter.delete(testKey);

      const result = await adapter.has(testKey);
      expect(result).toBe(false);
    });
  });

  describe("deleteByPrefix method", () => {
    test("should delete keys matching prefix and return count", async () => {
      await adapter.set("user:1", "value1");
      await adapter.set("user:2", "value2");
      await adapter.set("session:1", "session-value");

      const result = await adapter.deleteByPrefix("user_");

      expect(result).toBe(2);
      expect(await adapter.has("user:1")).toBe(false);
      expect(await adapter.has("user:2")).toBe(false);
      expect(await adapter.has("session:1")).toBe(true);
    });

    test("should return 0 when no keys match prefix", async () => {
      await adapter.set("user:1", "value1");

      const result = await adapter.deleteByPrefix("nonexistent_");

      expect(result).toBe(0);
      expect(await adapter.has("user:1")).toBe(true);
    });

    test("should return 0 when cache is empty", async () => {
      const result = await adapter.deleteByPrefix("user_");

      expect(result).toBe(0);
    });

    test("should not affect keys with different prefix", async () => {
      await adapter.set("user:1", "value1");
      await adapter.set("admin:1", "admin-value");

      await adapter.deleteByPrefix("user_");

      expect(await adapter.has("admin:1")).toBe(true);
    });
  });

  describe("clear method", () => {
    test("should remove all cached entries", async () => {
      await adapter.set("key1", "value1");
      await adapter.set("key2", "value2");
      await adapter.set("key3", "value3");

      await adapter.clear();

      expect(await adapter.has("key1")).toBe(false);
      expect(await adapter.has("key2")).toBe(false);
      expect(await adapter.has("key3")).toBe(false);
    });

    test("should not throw when cache directory is empty", async () => {
      await adapter.clear();
      expect(true).toBe(true);
    });

    test("should allow new entries after clear", async () => {
      await adapter.set("key1", "value1");
      await adapter.clear();
      await adapter.set("key2", "value2");

      expect(await adapter.has("key1")).toBe(false);
      expect(await adapter.get<string>("key2")).toBe("value2");
    });
  });

  describe("delete and has methods integration", () => {
    test("should return false when checking existence after deletion", async () => {
      await adapter.set(testKey, testValue);

      let exists = await adapter.has(testKey);
      expect(exists).toBe(true);

      const deleted = await adapter.delete(testKey);
      expect(deleted).toBe(true);

      exists = await adapter.has(testKey);
      expect(exists).toBe(false);
    });

    test("should handle delete and has operations on same non-existent key", async () => {
      const nonExistentKey = "does-not-exist";

      const exists = await adapter.has(nonExistentKey);
      expect(exists).toBe(false);

      const deleted = await adapter.delete(nonExistentKey);
      expect(deleted).toBe(false);

      const stillExists = await adapter.has(nonExistentKey);
      expect(stillExists).toBe(false);
    });

    test("should handle concurrent delete and has operations", async () => {
      const key1 = "concurrent:key1";
      const key2 = "concurrent:key2";

      await adapter.set(key1, "value1");
      await adapter.set(key2, "value2");

      const [exists1, exists2, deleted1, deleted2] = await Promise.all([
        adapter.has(key1),
        adapter.has(key2),
        adapter.delete(key1),
        adapter.delete(key2),
      ]);

      // Due to race conditions in concurrent operations, exists1/exists2 can be either true or false
      // depending on whether the has() operation executes before or after the delete() operation
      expect(typeof exists1).toBe("boolean");
      expect(typeof exists2).toBe("boolean");
      expect(deleted1).toBe(true);
      expect(deleted2).toBe(true);
    });
  });

  describe("integration tests", () => {
    test("should handle rapid get/set operations", async () => {
      const numOperations = 50;

      // Rapid set operations
      const setPromises = [];
      for (let i = 0; i < numOperations; i++) {
        setPromises.push(adapter.set(`rapid:${i}`, { index: i, data: `data:${i}` }));
      }
      await Promise.all(setPromises);

      // Rapid get operations
      const getPromises = [];
      for (let i = 0; i < numOperations; i++) {
        getPromises.push(adapter.get(`rapid:${i}`));
      }
      const results = await Promise.all(getPromises);

      // Verify results
      for (let i = 0; i < numOperations; i++) {
        expect(results[i]).toEqual({ index: i, data: `data:${i}` });
      }

      // Cleanup
      const deletePromises = [];
      for (let i = 0; i < numOperations; i++) {
        deletePromises.push(adapter.delete(`rapid:${i}`));
      }
      await Promise.all(deletePromises);
    });
  });
});
