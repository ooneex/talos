import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { AppEnv } from "@talosjs/app-env";
import { DragonflyRateLimiter, RateLimitException } from "@/index";

const createMockEnv = (): AppEnv => {
  return {
    RATE_LIMIT_DRAGONFLY_URL: Bun.env.RATE_LIMIT_DRAGONFLY_URL,
  } as unknown as AppEnv;
};

const defaultOptions = {
  connectionTimeout: 10_000,
  idleTimeout: 0,
  autoReconnect: true,
  maxRetries: 10,
  enableOfflineQueue: true,
  enableAutoPipelining: true,
};

const mockDragonflyClient = {
  connected: true,
  connect: mock(async (): Promise<void> => {
    mockDragonflyClient.connected = true;
  }),
  get: mock(async (_key: string): Promise<string | null> => null),
  incr: mock(async (_key: string): Promise<number> => 1),
  unlink: mock(async (..._keys: string[]): Promise<number> => 1),
  send: mock(async (_command: string, _args: string[]): Promise<number> => 1),
  ttl: mock(async (_key: string): Promise<number> => 60),
};

const MockRedisClient = mock(() => mockDragonflyClient);

const originalRedisClient = Bun.RedisClient;

(Bun as { RedisClient: unknown }).RedisClient = MockRedisClient;

describe("DragonflyRateLimiter", () => {
  let limiter: DragonflyRateLimiter;
  const testKey = "user:123";

  beforeAll(() => {
    Bun.env.RATE_LIMIT_DRAGONFLY_URL = "redis://localhost:6379";
  });

  afterAll(() => {
    delete Bun.env.RATE_LIMIT_DRAGONFLY_URL;
    (Bun as { RedisClient: unknown }).RedisClient = originalRedisClient;
  });

  beforeEach(() => {
    limiter = new DragonflyRateLimiter(createMockEnv(), {
      connectionString: "redis://localhost:6379/1",
    });

    for (const mockFn of [
      mockDragonflyClient.connect,
      mockDragonflyClient.get,
      mockDragonflyClient.incr,
      mockDragonflyClient.unlink,
      mockDragonflyClient.send,
      mockDragonflyClient.ttl,
      MockRedisClient,
    ]) {
      mockFn.mockClear();
    }

    mockDragonflyClient.connected = true;
    mockDragonflyClient.connect.mockImplementation(async (): Promise<void> => {
      mockDragonflyClient.connected = true;
    });
    mockDragonflyClient.get.mockImplementation(async (_key: string): Promise<string | null> => null);
    mockDragonflyClient.incr.mockImplementation(async (_key: string): Promise<number> => 1);
    mockDragonflyClient.unlink.mockImplementation(async (..._keys: string[]): Promise<number> => 1);
    mockDragonflyClient.send.mockImplementation(async (_command: string, _args: string[]): Promise<number> => 1);
    mockDragonflyClient.ttl.mockImplementation(async (_key: string): Promise<number> => 60);
  });

  describe("constructor", () => {
    test("should create the client with connection string and default options", () => {
      new DragonflyRateLimiter(createMockEnv(), { connectionString: "redis://dragonfly:6379/2" });

      expect(MockRedisClient).toHaveBeenCalledWith("redis://dragonfly:6379/2", defaultOptions);
    });

    test("should use the connection string from the environment", () => {
      new DragonflyRateLimiter(createMockEnv());

      expect(MockRedisClient).toHaveBeenCalledWith("redis://localhost:6379", defaultOptions);
    });

    test("should merge additional client options with defaults", () => {
      new DragonflyRateLimiter(createMockEnv(), {
        connectionString: "redis://localhost:6379",
        connectionTimeout: 5000,
      });

      expect(MockRedisClient).toHaveBeenCalledWith("redis://localhost:6379", {
        ...defaultOptions,
        connectionTimeout: 5000,
      });
    });

    test("should not forward the namespace to the client", () => {
      new DragonflyRateLimiter(createMockEnv(), {
        connectionString: "redis://localhost:6379",
        namespace: "app",
      });

      expect(MockRedisClient).toHaveBeenCalledWith("redis://localhost:6379", defaultOptions);
    });

    test("should throw when no connection string is available", () => {
      const env = { RATE_LIMIT_DRAGONFLY_URL: undefined } as unknown as AppEnv;

      expect(() => new DragonflyRateLimiter(env)).toThrow(RateLimitException);
      expect(() => new DragonflyRateLimiter(env)).toThrow("Dragonfly connection string is required");
      expect(() => new DragonflyRateLimiter(env)).toThrow("RATE_LIMIT_DRAGONFLY_URL");
    });
  });

  describe("check method", () => {
    test("should return not limited on first request", async () => {
      const result = await limiter.check(testKey);

      expect(result).toMatchObject({ limited: false, remaining: 999, total: 1000 });
      expect(result.resetAt).toBeInstanceOf(Date);
      expect(mockDragonflyClient.incr).toHaveBeenCalledWith("ratelimit:user:123");
    });

    test("should arm the window with EXPIRE NX on every check", async () => {
      mockDragonflyClient.incr.mockResolvedValue(5);

      await limiter.check(testKey);

      expect(mockDragonflyClient.send).toHaveBeenCalledWith("EXPIRE", ["ratelimit:user:123", "60", "NX"]);
    });

    test("should issue INCR, EXPIRE and TTL in order without waiting between them", async () => {
      const calls: string[] = [];
      const { promise, resolve } = Promise.withResolvers<void>();
      mockDragonflyClient.incr.mockImplementation(async () => {
        calls.push("incr");
        await promise;
        return 1;
      });
      mockDragonflyClient.send.mockImplementation(async (command: string) => {
        calls.push(command.toLowerCase());
        return 1;
      });
      mockDragonflyClient.ttl.mockImplementation(async () => {
        calls.push("ttl");
        return 60;
      });

      const pending = limiter.check(testKey);
      await Bun.sleep(0);

      expect(calls).toEqual(["incr", "expire", "ttl"]);
      resolve();
      await pending;
    });

    test("should return limited when count exceeds limit", async () => {
      mockDragonflyClient.incr.mockResolvedValue(1001);
      mockDragonflyClient.ttl.mockResolvedValue(30);

      const result = await limiter.check(testKey);

      expect(result).toMatchObject({ limited: true, remaining: 0, total: 1000 });
    });

    test("should not be limited when exactly at the limit", async () => {
      mockDragonflyClient.incr.mockResolvedValue(1000);

      const result = await limiter.check(testKey);

      expect(result).toMatchObject({ limited: false, remaining: 0 });
    });

    test("should calculate resetAt from the TTL", async () => {
      mockDragonflyClient.ttl.mockResolvedValue(30);

      const before = Date.now();
      const result = await limiter.check(testKey);
      const after = Date.now();

      expect(result.resetAt.getTime()).toBeGreaterThanOrEqual(before + 30_000);
      expect(result.resetAt.getTime()).toBeLessThanOrEqual(after + 30_000);
    });

    test("should never put resetAt in the past when the key has no TTL", async () => {
      mockDragonflyClient.ttl.mockResolvedValue(-1);

      const before = Date.now();
      const result = await limiter.check(testKey);

      expect(result.resetAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    test("should prefix key with custom namespace", async () => {
      const customLimiter = new DragonflyRateLimiter(createMockEnv(), {
        connectionString: "redis://localhost:6379/1",
        namespace: "myapp",
      });

      await customLimiter.check("ip:192.168.1.1");

      expect(mockDragonflyClient.incr).toHaveBeenCalledWith("myapp:ip:192.168.1.1");
      expect(mockDragonflyClient.send).toHaveBeenCalledWith("EXPIRE", ["myapp:ip:192.168.1.1", "60", "NX"]);
      expect(mockDragonflyClient.ttl).toHaveBeenCalledWith("myapp:ip:192.168.1.1");
    });

    test("should throw RateLimitException on Dragonfly error", async () => {
      mockDragonflyClient.incr.mockRejectedValue(new Error("Dragonfly connection failed"));

      await expect(limiter.check(testKey)).rejects.toThrow(RateLimitException);
      await expect(limiter.check(testKey)).rejects.toThrow('Failed to check rate limit for key "user:123"');
    });
  });

  describe("isLimited method", () => {
    test("should return the limited state from check", async () => {
      mockDragonflyClient.incr.mockResolvedValue(1001);

      await expect(limiter.isLimited(testKey)).resolves.toBe(true);
    });

    test("should throw RateLimitException when check fails", async () => {
      mockDragonflyClient.incr.mockRejectedValue(new Error("Dragonfly connection failed"));

      await expect(limiter.isLimited(testKey)).rejects.toThrow(RateLimitException);
    });
  });

  describe("reset method", () => {
    test("should unlink the rate limit key", async () => {
      const result = await limiter.reset(testKey);

      expect(result).toBe(true);
      expect(mockDragonflyClient.unlink).toHaveBeenCalledWith("ratelimit:user:123");
    });

    test("should return false for non-existent key", async () => {
      mockDragonflyClient.unlink.mockResolvedValue(0);

      await expect(limiter.reset("non-existent")).resolves.toBe(false);
    });

    test("should throw RateLimitException on Dragonfly error", async () => {
      mockDragonflyClient.unlink.mockRejectedValue(new Error("Dragonfly unlink failed"));

      await expect(limiter.reset(testKey)).rejects.toThrow(RateLimitException);
      await expect(limiter.reset(testKey)).rejects.toThrow('Failed to reset rate limit for key "user:123"');
    });
  });

  describe("getCount method", () => {
    test("should return current count", async () => {
      mockDragonflyClient.get.mockResolvedValue("42");

      await expect(limiter.getCount(testKey)).resolves.toBe(42);
      expect(mockDragonflyClient.get).toHaveBeenCalledWith("ratelimit:user:123");
    });

    test("should return 0 for non-existent key", async () => {
      await expect(limiter.getCount("non-existent")).resolves.toBe(0);
    });

    test("should throw RateLimitException on Dragonfly error", async () => {
      mockDragonflyClient.get.mockRejectedValue(new Error("Dragonfly get failed"));

      await expect(limiter.getCount(testKey)).rejects.toThrow(RateLimitException);
      await expect(limiter.getCount(testKey)).rejects.toThrow('Failed to get count for key "user:123"');
    });
  });

  describe("reconnection", () => {
    test("should reconnect a closed client before checking", async () => {
      mockDragonflyClient.connected = false;

      const result = await limiter.check(testKey);

      expect(mockDragonflyClient.connect).toHaveBeenCalledTimes(1);
      expect(result.limited).toBe(false);
    });

    test("should not reconnect a client that is still connected", async () => {
      await limiter.getCount(testKey);

      expect(mockDragonflyClient.connect).not.toHaveBeenCalled();
    });

    test("should share one reconnect attempt between concurrent commands", async () => {
      mockDragonflyClient.connected = false;
      const { promise, resolve } = Promise.withResolvers<void>();
      mockDragonflyClient.connect.mockImplementation(async (): Promise<void> => {
        await promise;
        mockDragonflyClient.connected = true;
      });

      const pending = Promise.all([limiter.check(testKey), limiter.getCount(testKey), limiter.reset(testKey)]);
      resolve();
      await pending;

      expect(mockDragonflyClient.connect).toHaveBeenCalledTimes(1);
    });

    test("should retry the connection on the next command after a failed attempt", async () => {
      mockDragonflyClient.connected = false;
      mockDragonflyClient.connect.mockImplementationOnce(async (): Promise<void> => {
        throw new Error("Connection closed");
      });

      await expect(limiter.check(testKey)).rejects.toThrow(RateLimitException);
      const result = await limiter.check(testKey);

      expect(mockDragonflyClient.connect).toHaveBeenCalledTimes(2);
      expect(result.total).toBe(1000);
    });
  });

  describe("integration scenarios", () => {
    test("should handle multiple keys independently", async () => {
      mockDragonflyClient.incr.mockImplementation(async (key: string) => {
        if (key === "ratelimit:user:1") return 50;
        if (key === "ratelimit:user:2") return 100;
        return 1;
      });

      const result1 = await limiter.check("user:1");
      const result2 = await limiter.check("user:2");

      expect(result1.remaining).toBe(950);
      expect(result2.remaining).toBe(900);
    });

    test("should handle check -> exceed -> reset -> check", async () => {
      mockDragonflyClient.incr.mockResolvedValue(1001);
      expect((await limiter.check(testKey)).limited).toBe(true);

      await expect(limiter.reset(testKey)).resolves.toBe(true);

      mockDragonflyClient.incr.mockResolvedValue(1);
      const result = await limiter.check(testKey);
      expect(result).toMatchObject({ limited: false, remaining: 999 });
    });
  });
});
