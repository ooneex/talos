import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { AppEnv } from "@talosjs/app-env";
import type { RedisConnectionOptionsType } from "@/index";
import { DatabaseException, RedisDatabase } from "@/index";

describe("RedisDatabase", () => {
  let adapter: RedisDatabase;
  let env: AppEnv;
  const testConnectionUrl = "redis://localhost:6379";

  // Environment variables backup
  const originalEnv = {
    DATABASE_REDIS_URL: process.env.DATABASE_REDIS_URL,
  };

  beforeEach(() => {
    // Reset environment variables
    delete process.env.DATABASE_REDIS_URL;
    env = new AppEnv();
  });

  afterEach(() => {
    // Restore environment variables
    if (originalEnv.DATABASE_REDIS_URL !== undefined) {
      process.env.DATABASE_REDIS_URL = originalEnv.DATABASE_REDIS_URL;
    }
  });

  describe("Constructor", () => {
    test("should create RedisDatabase with provided URL", () => {
      const options: RedisConnectionOptionsType = { url: testConnectionUrl };
      adapter = new RedisDatabase(env, options);

      expect(adapter).toBeInstanceOf(RedisDatabase);
      expect(adapter.getClient()).toBeDefined();
    });

    test("should create RedisDatabase with DATABASE_REDIS_URL environment variable", () => {
      process.env.DATABASE_REDIS_URL = testConnectionUrl;
      env = new AppEnv();
      adapter = new RedisDatabase(env);

      expect(adapter).toBeInstanceOf(RedisDatabase);
      expect(adapter.getClient()).toBeDefined();
    });

    test("should prefer provided URL over environment variables", () => {
      const providedUrl = "redis://provided:6379";
      process.env.DATABASE_REDIS_URL = "redis://env:6379";
      env = new AppEnv();

      adapter = new RedisDatabase(env, { url: providedUrl });

      expect(adapter).toBeInstanceOf(RedisDatabase);
      expect(adapter.getClient()).toBeDefined();
    });

    test("should throw DatabaseException when no connection URL is provided", () => {
      expect(() => {
        new RedisDatabase(env);
      }).toThrow(DatabaseException);

      expect(() => {
        new RedisDatabase(env);
      }).toThrow(
        "Redis connection URL is required. Please provide a connection URL either through the constructor options or set the DATABASE_REDIS_URL environment variable.",
      );
    });

    test("should throw DatabaseException with proper data when no URL provided", () => {
      const options: RedisConnectionOptionsType = { connectionTimeout: 5000 };

      try {
        new RedisDatabase(env, options);
      } catch (error) {
        expect(error).toBeInstanceOf(DatabaseException);
        const dbError = error as DatabaseException;
        expect(dbError.data).toEqual({});
      }
    });

    test("should create RedisClient with custom connection options", () => {
      const options: RedisConnectionOptionsType = {
        url: testConnectionUrl,
        connectionTimeout: 5000,
        idleTimeout: 30_000,
        autoReconnect: false,
        maxRetries: 3,
        enableOfflineQueue: false,
        enableAutoPipelining: false,
        tls: true,
      };

      adapter = new RedisDatabase(env, options);

      expect(adapter).toBeInstanceOf(RedisDatabase);
      expect(adapter.getClient()).toBeDefined();
    });

    test("should create RedisClient with partial custom options and defaults", () => {
      const options: RedisConnectionOptionsType = {
        url: testConnectionUrl,
        connectionTimeout: 15_000,
        maxRetries: 5,
      };

      adapter = new RedisDatabase(env, options);

      expect(adapter).toBeInstanceOf(RedisDatabase);
      expect(adapter.getClient()).toBeDefined();
    });

    test("should handle TLS configuration as boolean", () => {
      const options: RedisConnectionOptionsType = {
        url: testConnectionUrl,
        tls: true,
      };

      adapter = new RedisDatabase(env, options);

      expect(adapter).toBeInstanceOf(RedisDatabase);
      expect(adapter.getClient()).toBeDefined();
    });

    test("should handle TLS configuration as object", () => {
      const tlsConfig = {
        rejectUnauthorized: false,
        ca: "ca-cert",
        cert: "client-cert",
        key: "client-key",
      };

      const options: RedisConnectionOptionsType = {
        url: testConnectionUrl,
        tls: tlsConfig,
      };

      adapter = new RedisDatabase(env, options);

      expect(adapter).toBeInstanceOf(RedisDatabase);
      expect(adapter.getClient()).toBeDefined();
    });

    test("should handle zero values in options", () => {
      const options: RedisConnectionOptionsType = {
        url: testConnectionUrl,
        connectionTimeout: 0,
        idleTimeout: 0,
        maxRetries: 0,
      };

      adapter = new RedisDatabase(env, options);

      expect(adapter).toBeInstanceOf(RedisDatabase);
      expect(adapter.getClient()).toBeDefined();
    });
  });

  describe("getClient", () => {
    beforeEach(() => {
      adapter = new RedisDatabase(env, { url: testConnectionUrl });
    });

    test("should return the Redis client instance", () => {
      const client = adapter.getClient();
      expect(client).toBeDefined();
      expect(typeof client.connect).toBe("function");
      expect(typeof client.close).toBe("function");
      expect(typeof client.send).toBe("function");
    });

    test("should return the same client instance on multiple calls", () => {
      const client1 = adapter.getClient();
      const client2 = adapter.getClient();
      expect(client1).toBe(client2);
    });
  });

  describe("open", () => {
    beforeEach(() => {
      adapter = new RedisDatabase(env, { url: testConnectionUrl });
    });

    test("should return a client instance", async () => {
      const client = adapter.getClient();
      const connectSpy = spyOn(client, "connect").mockResolvedValue(undefined);

      const result = await adapter.open();

      expect(result).toBe(client);
      expect(connectSpy).toHaveBeenCalled();
    });

    test("should handle connection when already connected", async () => {
      const client = adapter.getClient();
      const connectSpy = spyOn(client, "connect").mockResolvedValue(undefined);

      // Mock client as already connected
      Object.defineProperty(client, "connected", {
        value: true,
        writable: true,
        configurable: true,
      });

      const result = await adapter.open();

      expect(result).toBe(client);
      expect(connectSpy).not.toHaveBeenCalled();
    });

    test("should throw DatabaseException when connection fails", async () => {
      const client = adapter.getClient();
      const connectionError = new Error("Connection failed");
      spyOn(client, "connect").mockRejectedValue(connectionError);

      expect(adapter.open()).rejects.toThrow(DatabaseException);
      expect(adapter.open()).rejects.toThrow("Failed to open Redis connection: Connection failed");
    });

    test("should throw DatabaseException with proper data when connection fails", async () => {
      const client = adapter.getClient();
      const connectionError = new Error("Connection timeout");
      spyOn(client, "connect").mockRejectedValue(connectionError);

      try {
        await adapter.open();
      } catch (error) {
        expect(error).toBeInstanceOf(DatabaseException);
        const dbError = error as DatabaseException;
        expect(dbError.data).toEqual({
          connectionUrl: testConnectionUrl,
          options: { url: testConnectionUrl },
          error: connectionError,
        });
      }
    });

    test("should handle non-Error objects when connection fails", async () => {
      const client = adapter.getClient();
      const stringError = "String error message";
      spyOn(client, "connect").mockRejectedValue(stringError);

      expect(adapter.open()).rejects.toThrow("Failed to open Redis connection: String error message");
    });

    test("should handle null/undefined errors", async () => {
      const client = adapter.getClient();
      spyOn(client, "connect").mockRejectedValue(null);

      expect(adapter.open()).rejects.toThrow("Failed to open Redis connection: null");
    });
  });

  describe("close", () => {
    beforeEach(() => {
      adapter = new RedisDatabase(env, { url: testConnectionUrl });
    });

    test("should close connection when connected", async () => {
      const client = adapter.getClient();
      const closeSpy = spyOn(client, "close").mockReturnValue(undefined);

      // Mock client as connected
      Object.defineProperty(client, "connected", {
        value: true,
        writable: true,
        configurable: true,
      });

      await adapter.close();

      expect(closeSpy).toHaveBeenCalledTimes(1);
    });

    test("should not close when not connected", async () => {
      const client = adapter.getClient();
      const closeSpy = spyOn(client, "close").mockReturnValue(undefined);

      // Mock client as not connected (default)
      Object.defineProperty(client, "connected", {
        value: false,
        writable: true,
        configurable: true,
      });

      await adapter.close();

      expect(closeSpy).not.toHaveBeenCalled();
    });

    test("should complete successfully when closing succeeds", async () => {
      const client = adapter.getClient();
      spyOn(client, "close").mockReturnValue(undefined);

      Object.defineProperty(client, "connected", {
        value: true,
        writable: true,
        configurable: true,
      });

      expect(adapter.close()).resolves.toBeUndefined();
    });

    test("should throw DatabaseException when close fails", async () => {
      const client = adapter.getClient();
      const closeError = new Error("Close failed");

      Object.defineProperty(client, "connected", {
        value: true,
        writable: true,
        configurable: true,
      });

      spyOn(client, "close").mockImplementation(() => {
        throw closeError;
      });

      expect(adapter.close()).rejects.toThrow(DatabaseException);
      expect(adapter.close()).rejects.toThrow("Failed to close Redis connection: Close failed");
    });

    test("should throw DatabaseException with proper data when close fails", async () => {
      const client = adapter.getClient();
      const closeError = new Error("Connection close timeout");

      Object.defineProperty(client, "connected", {
        value: true,
        writable: true,
        configurable: true,
      });

      spyOn(client, "close").mockImplementation(() => {
        throw closeError;
      });

      try {
        await adapter.close();
      } catch (error) {
        expect(error).toBeInstanceOf(DatabaseException);
        const dbError = error as DatabaseException;
        expect(dbError.data).toEqual({
          connectionUrl: testConnectionUrl,
          error: closeError,
        });
      }
    });

    test("should handle non-Error objects when close fails", async () => {
      const client = adapter.getClient();
      const stringError = "Close error message";

      Object.defineProperty(client, "connected", {
        value: true,
        writable: true,
        configurable: true,
      });

      spyOn(client, "close").mockImplementation(() => {
        throw stringError;
      });

      expect(adapter.close()).rejects.toThrow("Failed to close Redis connection: Close error message");
    });
  });

  describe("drop", () => {
    beforeEach(() => {
      adapter = new RedisDatabase(env, { url: testConnectionUrl });
    });

    test("should flush database when connected", async () => {
      const client = adapter.getClient();
      const sendSpy = spyOn(client, "send").mockResolvedValue("OK");

      Object.defineProperty(client, "connected", {
        value: true,
        writable: true,
        configurable: true,
      });

      await adapter.drop();

      expect(sendSpy).toHaveBeenCalledWith("FLUSHDB", []);
    });

    test("should connect before flushing when not connected", async () => {
      const client = adapter.getClient();
      const connectSpy = spyOn(client, "connect").mockResolvedValue(undefined);
      const sendSpy = spyOn(client, "send").mockResolvedValue("OK");

      Object.defineProperty(client, "connected", {
        value: false,
        writable: true,
        configurable: true,
      });

      await adapter.drop();

      expect(connectSpy).toHaveBeenCalledTimes(1);
      expect(sendSpy).toHaveBeenCalledWith("FLUSHDB", []);
    });

    test("should complete successfully when drop succeeds", async () => {
      const client = adapter.getClient();
      spyOn(client, "send").mockResolvedValue("OK");

      Object.defineProperty(client, "connected", {
        value: true,
        writable: true,
        configurable: true,
      });

      expect(adapter.drop()).resolves.toBeUndefined();
    });

    test("should throw DatabaseException when FLUSHDB fails", async () => {
      const client = adapter.getClient();
      const flushError = new Error("FLUSHDB failed");
      spyOn(client, "send").mockRejectedValue(flushError);

      Object.defineProperty(client, "connected", {
        value: true,
        writable: true,
        configurable: true,
      });

      expect(adapter.drop()).rejects.toThrow(DatabaseException);
      expect(adapter.drop()).rejects.toThrow("Failed to drop Redis database: FLUSHDB failed");
    });

    test("should throw DatabaseException with proper data when drop fails", async () => {
      const client = adapter.getClient();
      const dropError = new Error("Database drop failed");
      spyOn(client, "send").mockRejectedValue(dropError);

      Object.defineProperty(client, "connected", {
        value: true,
        writable: true,
        configurable: true,
      });

      try {
        await adapter.drop();
      } catch (error) {
        expect(error).toBeInstanceOf(DatabaseException);
        const dbError = error as DatabaseException;
        expect(dbError.data).toEqual({
          connectionUrl: testConnectionUrl,
          error: dropError,
        });
      }
    });

    test("should handle connection failure during drop", async () => {
      const client = adapter.getClient();
      const connectionError = new Error("Connection failed during drop");
      spyOn(client, "connect").mockRejectedValue(connectionError);

      Object.defineProperty(client, "connected", {
        value: false,
        writable: true,
        configurable: true,
      });

      expect(adapter.drop()).rejects.toThrow(DatabaseException);
      expect(adapter.drop()).rejects.toThrow(
        "Failed to drop Redis database: Failed to open Redis connection: Connection failed during drop",
      );
    });

    test("should handle non-Error objects when drop fails", async () => {
      const client = adapter.getClient();
      const stringError = "Drop operation failed";
      spyOn(client, "send").mockRejectedValue(stringError);

      Object.defineProperty(client, "connected", {
        value: true,
        writable: true,
        configurable: true,
      });

      expect(adapter.drop()).rejects.toThrow("Failed to drop Redis database: Drop operation failed");
    });

    test("should handle successful FLUSHDB with different response formats", async () => {
      const responses = ["OK", "1", "true", "FLUSHED"];

      Object.defineProperty(adapter.getClient(), "connected", {
        value: true,
        writable: true,
        configurable: true,
      });

      for (const response of responses) {
        const client = adapter.getClient();
        const sendSpy = spyOn(client, "send").mockResolvedValue(response);

        expect(adapter.drop()).resolves.toBeUndefined();
        expect(sendSpy).toHaveBeenCalledWith("FLUSHDB", []);

        // Reset spy for next iteration
        sendSpy.mockRestore();
      }
    });
  });

  describe("Integration Tests", () => {
    beforeEach(() => {
      adapter = new RedisDatabase(env, { url: testConnectionUrl });
    });

    test("should handle complete lifecycle: open -> drop -> close", async () => {
      const client = adapter.getClient();
      const connectSpy = spyOn(client, "connect").mockResolvedValue(undefined);
      const sendSpy = spyOn(client, "send").mockResolvedValue("OK");
      const closeSpy = spyOn(client, "close").mockReturnValue(undefined);

      // Simulate connection state changes
      let connected = false;
      Object.defineProperty(client, "connected", {
        get: () => connected,
        set: (value) => {
          connected = value;
        },
        configurable: true,
      });

      connectSpy.mockImplementation(() => {
        connected = true;
        return Promise.resolve();
      });

      closeSpy.mockImplementation(() => {
        connected = false;
      });

      // Open connection
      const clientResult = await adapter.open();
      expect(clientResult).toBe(client);
      expect(connectSpy).toHaveBeenCalledTimes(1);

      // Drop database
      await adapter.drop();
      expect(sendSpy).toHaveBeenCalledWith("FLUSHDB", []);

      // Close connection
      await adapter.close();
      expect(closeSpy).toHaveBeenCalledTimes(1);
    });

    test("should handle multiple operations on same adapter instance", async () => {
      const client = adapter.getClient();
      const connectSpy = spyOn(client, "connect").mockResolvedValue(undefined);
      const sendSpy = spyOn(client, "send").mockResolvedValue("OK");
      const closeSpy = spyOn(client, "close").mockReturnValue(undefined);

      let connected = false;
      Object.defineProperty(client, "connected", {
        get: () => connected,
        set: (value) => {
          connected = value;
        },
        configurable: true,
      });

      connectSpy.mockImplementation(() => {
        connected = true;
        return Promise.resolve();
      });

      closeSpy.mockImplementation(() => {
        connected = false;
      });

      // First cycle
      await adapter.open();
      await adapter.drop();
      await adapter.close();

      // Second cycle - should work independently
      await adapter.open();
      await adapter.drop();
      await adapter.close();

      expect(connectSpy).toHaveBeenCalledTimes(2);
      expect(sendSpy).toHaveBeenCalledTimes(2);
      expect(closeSpy).toHaveBeenCalledTimes(2);
    });

    test("should handle rapid successive calls", async () => {
      const client = adapter.getClient();
      const connectSpy = spyOn(client, "connect").mockResolvedValue(undefined);

      let connected = false;
      Object.defineProperty(client, "connected", {
        get: () => connected,
        set: (value) => {
          connected = value;
        },
        configurable: true,
      });

      connectSpy.mockImplementation(() => {
        connected = true;
        return Promise.resolve();
      });

      // Multiple open calls should only connect once if already connected
      await adapter.open();
      await adapter.open();
      await adapter.open();

      expect(connectSpy).toHaveBeenCalledTimes(1);
    });

    test("should handle error recovery scenarios", async () => {
      const client = adapter.getClient();
      const connectSpy = spyOn(client, "connect");

      Object.defineProperty(client, "connected", {
        value: false,
        writable: true,
        configurable: true,
      });

      // First attempt fails
      connectSpy.mockRejectedValueOnce(new Error("First failure"));

      expect(adapter.open()).rejects.toThrow(DatabaseException);

      // Second attempt succeeds
      connectSpy.mockResolvedValueOnce(undefined);

      const clientResult = await adapter.open();
      expect(clientResult).toBe(client);
      expect(connectSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("Edge Cases and Error Handling", () => {
    test("should handle empty connection URL from environment", () => {
      process.env.DATABASE_REDIS_URL = "";
      env = new AppEnv();

      expect(() => {
        new RedisDatabase(env);
      }).toThrow(DatabaseException);
    });

    test("should handle whitespace-only connection URL", () => {
      expect(() => {
        new RedisDatabase(env, { url: "   " });
      }).not.toThrow();

      const adapter = new RedisDatabase(env, { url: "   " });
      expect(adapter).toBeInstanceOf(RedisDatabase);
    });

    test("should handle very long connection URLs", () => {
      const longUrl =
        "redis://user:password@very-long-hostname-that-exceeds-normal-length.example.com:6379/database?param1=value1&param2=value2";

      adapter = new RedisDatabase(env, { url: longUrl });

      expect(adapter).toBeInstanceOf(RedisDatabase);
    });

    test("should handle special characters in connection URL", () => {
      const urlWithSpecialChars = "redis://user%40domain:p%40ssw0rd@host:6379/0";

      adapter = new RedisDatabase(env, { url: urlWithSpecialChars });

      expect(adapter).toBeInstanceOf(RedisDatabase);
    });

    test("should handle negative timeout values", () => {
      const options: RedisConnectionOptionsType = {
        url: testConnectionUrl,
        connectionTimeout: -1000,
        idleTimeout: -5000,
      };

      expect(() => {
        new RedisDatabase(env, options);
      }).toThrow();
    });

    test("should handle very large timeout values", () => {
      const options: RedisConnectionOptionsType = {
        url: testConnectionUrl,
        connectionTimeout: Number.MAX_SAFE_INTEGER,
        idleTimeout: Number.MAX_SAFE_INTEGER,
      };

      expect(() => {
        new RedisDatabase(env, options);
      }).toThrow();
    });

    test("should handle invalid TLS configuration gracefully", () => {
      const options = {
        url: testConnectionUrl,
        tls: {
          invalidProperty: true,
        } as unknown as boolean, // Invalid TLS config to test error handling
      };

      expect(() => {
        new RedisDatabase(env, options as RedisConnectionOptionsType);
      }).toThrow();
    });
  });

  describe("Connection Options Defaults and Overrides", () => {
    test("should use correct defaults for all boolean options", () => {
      adapter = new RedisDatabase(env, { url: testConnectionUrl });

      expect(adapter).toBeInstanceOf(RedisDatabase);
      expect(adapter.getClient()).toBeDefined();
    });

    test("should handle explicit false values correctly", () => {
      const options: RedisConnectionOptionsType = {
        url: testConnectionUrl,
        autoReconnect: false,
        enableOfflineQueue: false,
        enableAutoPipelining: false,
      };

      adapter = new RedisDatabase(env, options);

      expect(adapter).toBeInstanceOf(RedisDatabase);
      expect(adapter.getClient()).toBeDefined();
    });

    test("should handle explicit true values correctly", () => {
      const options: RedisConnectionOptionsType = {
        url: testConnectionUrl,
        autoReconnect: true,
        enableOfflineQueue: true,
        enableAutoPipelining: true,
      };

      adapter = new RedisDatabase(env, options);

      expect(adapter).toBeInstanceOf(RedisDatabase);
      expect(adapter.getClient()).toBeDefined();
    });

    test("should handle undefined values by using defaults", () => {
      const options = {
        url: testConnectionUrl,
      };

      adapter = new RedisDatabase(env, options);

      expect(adapter).toBeInstanceOf(RedisDatabase);
      expect(adapter.getClient()).toBeDefined();
    });
  });

  describe("Memory and Resource Management", () => {
    test("should maintain reference to the same client instance", () => {
      adapter = new RedisDatabase(env, { url: testConnectionUrl });

      const client1 = adapter.getClient();
      const client2 = adapter.getClient();

      expect(client1).toBe(client2);
    });

    test("should not recreate client on multiple adapter method calls", () => {
      adapter = new RedisDatabase(env, { url: testConnectionUrl });

      const client1 = adapter.getClient();
      const client2 = adapter.getClient();
      const client3 = adapter.getClient();

      expect(client1).toBe(client2);
      expect(client2).toBe(client3);
    });
  });

  describe("Environment Variable Handling", () => {
    test("should handle missing environment variables gracefully", () => {
      delete process.env.REDIS_URL;

      expect(() => {
        new RedisDatabase(env);
      }).toThrow(DatabaseException);
    });

    test("should handle environment variables with different formats", () => {
      const testUrls = [
        "redis://localhost:6379",
        "redis://user:pass@localhost:6379/0",
        "rediss://secure.redis.com:6380",
        "redis://localhost:6379?db=1&timeout=5000",
      ];

      testUrls.forEach((url) => {
        process.env.DATABASE_REDIS_URL = url;
        env = new AppEnv();
        adapter = new RedisDatabase(env);
        expect(adapter).toBeInstanceOf(RedisDatabase);
        delete process.env.DATABASE_REDIS_URL;
      });
    });

    test("should prioritize explicit options over environment", () => {
      process.env.REDIS_URL = "redis://env-server:6379";
      const explicitUrl = "redis://explicit-server:6379";

      adapter = new RedisDatabase(env, { url: explicitUrl });

      expect(adapter).toBeInstanceOf(RedisDatabase);
      expect(adapter.getClient()).toBeDefined();
    });
  });
});
