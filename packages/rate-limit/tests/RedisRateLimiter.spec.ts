import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { AppEnv } from "@talosjs/app-env";
import { RateLimitException, RedisRateLimiter } from "@/index";

const createMockEnv = (): AppEnv => {
  return {
    RATE_LIMIT_REDIS_URL: Bun.env.RATE_LIMIT_REDIS_URL,
  } as unknown as AppEnv;
};

// Default options that the rate limiter uses
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
  get: mock(async (_key: string): Promise<string | null> => null),
  incr: mock(async (_key: string): Promise<number> => 1),
  del: mock(async (_key: string): Promise<number> => 1),
  expire: mock(async (_key: string, _seconds: number): Promise<number> => 1),
  ttl: mock(async (_key: string): Promise<number> => 3600),
};

// Mock the RedisClient constructor
const MockRedisClient = mock(() => mockRedisClient);

// Store original Bun.RedisClient to restore later
const originalRedisClient = Bun.RedisClient;

// Replace Bun.RedisClient with our mock
(Bun as { RedisClient: unknown }).RedisClient = MockRedisClient;

describe("RedisRateLimiter", () => {
  let limiter: RedisRateLimiter;
  const testKey = "user:123";

  beforeAll(() => {
    // Set environment variable for tests that rely on it
    Bun.env.RATE_LIMIT_REDIS_URL = "redis://localhost:6379";
  });

  afterAll(() => {
    // Clean up environment variable
    delete Bun.env.RATE_LIMIT_REDIS_URL;
    // Restore original RedisClient
    (Bun as { RedisClient: unknown }).RedisClient = originalRedisClient;
  });

  beforeEach(() => {
    // Create a new limiter for each test
    limiter = new RedisRateLimiter(createMockEnv(), {
      connectionString: "redis://localhost:6379/1",
    });

    // Reset all mocks
    const mocksToReset = [
      mockRedisClient.get,
      mockRedisClient.incr,
      mockRedisClient.del,
      mockRedisClient.expire,
      mockRedisClient.ttl,
      MockRedisClient,
    ];

    mocksToReset.forEach((mockFn) => {
      if (mockFn && typeof mockFn.mockClear === "function") {
        mockFn.mockClear();
      }
    });

    // Reset mock implementations to defaults
    mockRedisClient.get.mockImplementation(async (_key: string): Promise<string | null> => null);
    mockRedisClient.incr.mockImplementation(async (_key: string): Promise<number> => 1);
    mockRedisClient.del.mockImplementation(async (_key: string): Promise<number> => 1);
    mockRedisClient.expire.mockImplementation(async (_key: string, _seconds: number): Promise<number> => 1);
    mockRedisClient.ttl.mockImplementation(async (_key: string): Promise<number> => 3600);
  });

  describe("constructor", () => {
    test("should create RedisClient with connection string and default options", () => {
      new RedisRateLimiter(createMockEnv(), {
        connectionString: "redis://test:6379/2",
      });

      expect(MockRedisClient).toHaveBeenCalledWith("redis://test:6379/2", defaultOptions);
    });

    test("should use default connection string from env", () => {
      const originalRedisUrl = Bun.env.RATE_LIMIT_REDIS_URL;
      Bun.env.RATE_LIMIT_REDIS_URL = "redis://localhost:6379";

      new RedisRateLimiter(createMockEnv());

      expect(MockRedisClient).toHaveBeenCalledWith("redis://localhost:6379", defaultOptions);

      if (originalRedisUrl) {
        Bun.env.RATE_LIMIT_REDIS_URL = originalRedisUrl;
      } else {
        delete Bun.env.RATE_LIMIT_REDIS_URL;
      }
    });

    test("should throw RateLimitException when no connection string provided", () => {
      const originalRedisUrl = Bun.env.RATE_LIMIT_REDIS_URL;
      delete Bun.env.RATE_LIMIT_REDIS_URL;

      expect(() => new RedisRateLimiter(createMockEnv())).toThrow(RateLimitException);
      expect(() => new RedisRateLimiter(createMockEnv())).toThrow("Redis connection string is required");

      if (originalRedisUrl) {
        Bun.env.RATE_LIMIT_REDIS_URL = originalRedisUrl;
      }
    });

    test("should merge additional client options with defaults", () => {
      const customOptions = { connectionTimeout: 5000 };
      new RedisRateLimiter(createMockEnv(), {
        connectionString: "redis://localhost:6379",
        ...customOptions,
      });

      expect(MockRedisClient).toHaveBeenCalledWith("redis://localhost:6379", {
        ...defaultOptions,
        ...customOptions,
      });
    });
  });

  describe("check method", () => {
    test("should return not limited on first request", async () => {
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.ttl.mockResolvedValue(60);

      const result = await limiter.check(testKey);

      expect(result.limited).toBe(false);
      expect(result.remaining).toBe(119);
      expect(result.total).toBe(120);
      expect(result.resetAt).toBeInstanceOf(Date);
      expect(mockRedisClient.incr).toHaveBeenCalledWith("ratelimit:user:123");
      expect(mockRedisClient.expire).toHaveBeenCalledWith("ratelimit:user:123", 60);
    });

    test("should set expiry only on first request in window", async () => {
      mockRedisClient.incr.mockResolvedValue(5);
      mockRedisClient.ttl.mockResolvedValue(50);

      await limiter.check(testKey);

      expect(mockRedisClient.expire).not.toHaveBeenCalled();
    });

    test("should return limited when count exceeds limit", async () => {
      mockRedisClient.incr.mockResolvedValue(121);
      mockRedisClient.ttl.mockResolvedValue(30);

      const result = await limiter.check(testKey);

      expect(result.limited).toBe(true);
      expect(result.remaining).toBe(0);
      expect(result.total).toBe(120);
    });

    test("should return remaining count correctly", async () => {
      mockRedisClient.incr.mockResolvedValue(50);
      mockRedisClient.ttl.mockResolvedValue(60);

      const result = await limiter.check(testKey);

      expect(result.limited).toBe(false);
      expect(result.remaining).toBe(70);
    });

    test("should return zero remaining when at limit", async () => {
      mockRedisClient.incr.mockResolvedValue(120);
      mockRedisClient.ttl.mockResolvedValue(60);

      const result = await limiter.check(testKey);

      expect(result.limited).toBe(false);
      expect(result.remaining).toBe(0);
    });

    test("should calculate resetAt correctly from TTL", async () => {
      const ttlSeconds = 30;
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.ttl.mockResolvedValue(ttlSeconds);

      const beforeCheck = Date.now();
      const result = await limiter.check(testKey);
      const afterCheck = Date.now();

      const expectedResetAtMin = beforeCheck + ttlSeconds * 1000;
      const expectedResetAtMax = afterCheck + ttlSeconds * 1000;

      expect(result.resetAt.getTime()).toBeGreaterThanOrEqual(expectedResetAtMin);
      expect(result.resetAt.getTime()).toBeLessThanOrEqual(expectedResetAtMax);
    });

    test("should prefix key with default namespace", async () => {
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.ttl.mockResolvedValue(60);

      await limiter.check("ip:192.168.1.1");

      expect(mockRedisClient.incr).toHaveBeenCalledWith("ratelimit:ip:192.168.1.1");
    });

    test("should prefix key with custom namespace", async () => {
      const customLimiter = new RedisRateLimiter(createMockEnv(), {
        connectionString: "redis://localhost:6379/1",
        namespace: "myapp",
      });
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.ttl.mockResolvedValue(60);

      await customLimiter.check("ip:192.168.1.1");

      expect(mockRedisClient.incr).toHaveBeenCalledWith("myapp:ip:192.168.1.1");
    });

    test("should throw RateLimitException on Redis error", async () => {
      mockRedisClient.incr.mockRejectedValue(new Error("Redis connection failed"));

      expect(limiter.check(testKey)).rejects.toThrow(RateLimitException);
      expect(limiter.check(testKey)).rejects.toThrow('Failed to check rate limit for key "user:123"');
    });
  });

  describe("reset method", () => {
    test("should delete rate limit key", async () => {
      mockRedisClient.del.mockResolvedValue(1);

      const result = await limiter.reset(testKey);

      expect(result).toBe(true);
      expect(mockRedisClient.del).toHaveBeenCalledWith("ratelimit:user:123");
    });

    test("should return false for non-existent key", async () => {
      mockRedisClient.del.mockResolvedValue(0);

      const result = await limiter.reset("non-existent");

      expect(result).toBe(false);
    });

    test("should prefix key with default namespace", async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await limiter.reset("ip:192.168.1.1");

      expect(mockRedisClient.del).toHaveBeenCalledWith("ratelimit:ip:192.168.1.1");
    });

    test("should prefix key with custom namespace", async () => {
      const customLimiter = new RedisRateLimiter(createMockEnv(), {
        connectionString: "redis://localhost:6379/1",
        namespace: "myapp",
      });
      mockRedisClient.del.mockResolvedValue(1);

      await customLimiter.reset("ip:192.168.1.1");

      expect(mockRedisClient.del).toHaveBeenCalledWith("myapp:ip:192.168.1.1");
    });

    test("should throw RateLimitException on Redis error", async () => {
      mockRedisClient.del.mockRejectedValue(new Error("Redis delete failed"));

      expect(limiter.reset(testKey)).rejects.toThrow(RateLimitException);
      expect(limiter.reset(testKey)).rejects.toThrow('Failed to reset rate limit for key "user:123"');
    });
  });

  describe("getCount method", () => {
    test("should return current count", async () => {
      mockRedisClient.get.mockResolvedValue("42");

      const result = await limiter.getCount(testKey);

      expect(result).toBe(42);
      expect(mockRedisClient.get).toHaveBeenCalledWith("ratelimit:user:123");
    });

    test("should return 0 for non-existent key", async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await limiter.getCount("non-existent");

      expect(result).toBe(0);
    });

    test("should prefix key with default namespace", async () => {
      mockRedisClient.get.mockResolvedValue("10");

      await limiter.getCount("ip:192.168.1.1");

      expect(mockRedisClient.get).toHaveBeenCalledWith("ratelimit:ip:192.168.1.1");
    });

    test("should prefix key with custom namespace", async () => {
      const customLimiter = new RedisRateLimiter(createMockEnv(), {
        connectionString: "redis://localhost:6379/1",
        namespace: "myapp",
      });
      mockRedisClient.get.mockResolvedValue("10");

      await customLimiter.getCount("ip:192.168.1.1");

      expect(mockRedisClient.get).toHaveBeenCalledWith("myapp:ip:192.168.1.1");
    });

    test("should throw RateLimitException on Redis error", async () => {
      mockRedisClient.get.mockRejectedValue(new Error("Redis get failed"));

      expect(limiter.getCount(testKey)).rejects.toThrow(RateLimitException);
      expect(limiter.getCount(testKey)).rejects.toThrow('Failed to get count for key "user:123"');
    });
  });

  describe("integration scenarios", () => {
    test("should handle rate limit workflow: check -> exceed -> reset -> check", async () => {
      // First check - not limited
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.ttl.mockResolvedValue(60);
      let result = await limiter.check(testKey);
      expect(result.limited).toBe(false);
      expect(result.remaining).toBe(119);

      // Exceed limit
      mockRedisClient.incr.mockResolvedValue(121);
      result = await limiter.check(testKey);
      expect(result.limited).toBe(true);
      expect(result.remaining).toBe(0);

      // Reset
      mockRedisClient.del.mockResolvedValue(1);
      const resetResult = await limiter.reset(testKey);
      expect(resetResult).toBe(true);

      // Check again - should be reset
      mockRedisClient.incr.mockResolvedValue(1);
      result = await limiter.check(testKey);
      expect(result.limited).toBe(false);
      expect(result.remaining).toBe(119);
    });

    test("should handle multiple keys independently", async () => {
      mockRedisClient.incr.mockImplementation(async (key: string) => {
        if (key === "ratelimit:user:1") return 50;
        if (key === "ratelimit:user:2") return 100;
        return 1;
      });
      mockRedisClient.ttl.mockResolvedValue(60);

      const result1 = await limiter.check("user:1");
      const result2 = await limiter.check("user:2");

      expect(result1.remaining).toBe(70);
      expect(result2.remaining).toBe(20);
      expect(result1.limited).toBe(false);
      expect(result2.limited).toBe(false);
    });

    test("should handle concurrent checks", async () => {
      let counter = 0;
      mockRedisClient.incr.mockImplementation(async () => ++counter);
      mockRedisClient.ttl.mockResolvedValue(60);

      const results = await Promise.all([limiter.check(testKey), limiter.check(testKey), limiter.check(testKey)]);

      expect(results.every((r) => r.limited === false)).toBe(true);
      expect(mockRedisClient.incr).toHaveBeenCalledTimes(3);
    });
  });
});
