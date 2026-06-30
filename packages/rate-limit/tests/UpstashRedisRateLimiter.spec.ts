import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { AppEnv } from "@talosjs/app-env";
import { RateLimitException, UpstashRedisRateLimiter } from "@/index";

const createMockEnv = (): AppEnv => {
  return {
    RATE_LIMIT_UPSTASH_REDIS_URL: Bun.env.RATE_LIMIT_UPSTASH_REDIS_URL,
    RATE_LIMIT_UPSTASH_REDIS_TOKEN: Bun.env.RATE_LIMIT_UPSTASH_REDIS_TOKEN,
  } as unknown as AppEnv;
};

// Mock Ratelimit instance methods
const mockRatelimitInstance = {
  limit: mock(async (_key: string) => ({
    success: true,
    remaining: 119,
    limit: 120,
    reset: Date.now() + 60_000,
  })),
  resetUsedTokens: mock(async (_key: string): Promise<void> => {}),
  getRemaining: mock(async (_key: string) => ({ remaining: 100 })),
};

// Mock @upstash/ratelimit
mock.module("@upstash/ratelimit", () => {
  function MockRatelimit(_options: Record<string, unknown>) {
    return mockRatelimitInstance;
  }
  MockRatelimit.fixedWindow = (_limit: number, _window: string) => ({ type: "fixedWindow" });
  MockRatelimit.slidingWindow = (_limit: number, _window: string) => ({ type: "slidingWindow" });
  MockRatelimit.tokenBucket = (_refillRate: number, _interval: string, _maxTokens: number) => ({
    type: "tokenBucket",
  });

  return { Ratelimit: MockRatelimit };
});

// Mock @upstash/redis
mock.module("@upstash/redis", () => ({
  Redis: class MockRedis {},
}));

describe("UpstashRedisRateLimiter", () => {
  let limiter: UpstashRedisRateLimiter;
  const testKey = "user:123";

  beforeAll(() => {
    Bun.env.RATE_LIMIT_UPSTASH_REDIS_URL = "https://test.upstash.io";
    Bun.env.RATE_LIMIT_UPSTASH_REDIS_TOKEN = "test-token";
  });

  afterAll(() => {
    delete Bun.env.RATE_LIMIT_UPSTASH_REDIS_URL;
    delete Bun.env.RATE_LIMIT_UPSTASH_REDIS_TOKEN;
  });

  beforeEach(() => {
    limiter = new UpstashRedisRateLimiter(createMockEnv(), {
      url: "https://test.upstash.io",
      token: "test-token",
    });

    mockRatelimitInstance.limit.mockClear();
    mockRatelimitInstance.resetUsedTokens.mockClear();
    mockRatelimitInstance.getRemaining.mockClear();

    // Reset default implementations
    mockRatelimitInstance.limit.mockImplementation(async () => ({
      success: true,
      remaining: 119,
      limit: 120,
      reset: Date.now() + 60_000,
    }));
    mockRatelimitInstance.resetUsedTokens.mockImplementation(async (): Promise<void> => {});
    mockRatelimitInstance.getRemaining.mockImplementation(async () => ({ remaining: 100 }));
  });

  describe("constructor", () => {
    test("should create limiter with url and token from options", () => {
      const instance = new UpstashRedisRateLimiter(createMockEnv(), {
        url: "https://custom.upstash.io",
        token: "custom-token",
      });

      expect(instance).toBeInstanceOf(UpstashRedisRateLimiter);
    });

    test("should create limiter with url and token from env", () => {
      const instance = new UpstashRedisRateLimiter(createMockEnv());

      expect(instance).toBeInstanceOf(UpstashRedisRateLimiter);
    });

    test("should throw RateLimitException when no url provided", () => {
      const originalUrl = Bun.env.RATE_LIMIT_UPSTASH_REDIS_URL;
      delete Bun.env.RATE_LIMIT_UPSTASH_REDIS_URL;

      expect(() => new UpstashRedisRateLimiter(createMockEnv(), { token: "test-token" })).toThrow(RateLimitException);
      expect(() => new UpstashRedisRateLimiter(createMockEnv(), { token: "test-token" })).toThrow(
        "Upstash Redis REST URL is required",
      );

      Bun.env.RATE_LIMIT_UPSTASH_REDIS_URL = originalUrl;
    });

    test("should throw RateLimitException when no token provided", () => {
      const originalToken = Bun.env.RATE_LIMIT_UPSTASH_REDIS_TOKEN;
      delete Bun.env.RATE_LIMIT_UPSTASH_REDIS_TOKEN;

      expect(() => new UpstashRedisRateLimiter(createMockEnv(), { url: "https://test.upstash.io" })).toThrow(
        RateLimitException,
      );

      Bun.env.RATE_LIMIT_UPSTASH_REDIS_TOKEN = originalToken;
    });

    test("should accept custom algorithm options", () => {
      const instance = new UpstashRedisRateLimiter(createMockEnv(), {
        url: "https://test.upstash.io",
        token: "test-token",
        algorithm: { type: "fixedWindow", limit: 50, window: "30 s" },
      });

      expect(instance).toBeInstanceOf(UpstashRedisRateLimiter);
    });

    test("should accept tokenBucket algorithm", () => {
      const instance = new UpstashRedisRateLimiter(createMockEnv(), {
        url: "https://test.upstash.io",
        token: "test-token",
        algorithm: { type: "tokenBucket", refillRate: 10, interval: "1 s", maxTokens: 100 },
      });

      expect(instance).toBeInstanceOf(UpstashRedisRateLimiter);
    });

    test("should accept custom prefix and analytics options", () => {
      const instance = new UpstashRedisRateLimiter(createMockEnv(), {
        url: "https://test.upstash.io",
        token: "test-token",
        prefix: "custom-prefix",
        analytics: false,
      });

      expect(instance).toBeInstanceOf(UpstashRedisRateLimiter);
    });

    test("should accept custom namespace option", () => {
      const instance = new UpstashRedisRateLimiter(createMockEnv(), {
        url: "https://test.upstash.io",
        token: "test-token",
        namespace: "myapp",
      });

      expect(instance).toBeInstanceOf(UpstashRedisRateLimiter);
    });

    test("should use prefix over namespace when both are provided", () => {
      const instance = new UpstashRedisRateLimiter(createMockEnv(), {
        url: "https://test.upstash.io",
        token: "test-token",
        namespace: "myapp",
        prefix: "custom-prefix",
      });

      expect(instance).toBeInstanceOf(UpstashRedisRateLimiter);
    });
  });

  describe("check method", () => {
    test("should return not limited when request succeeds", async () => {
      const resetTime = Date.now() + 60_000;
      mockRatelimitInstance.limit.mockResolvedValue({
        success: true,
        remaining: 99,
        limit: 120,
        reset: resetTime,
      });

      const result = await limiter.check(testKey);

      expect(result.limited).toBe(false);
      expect(result.remaining).toBe(99);
      expect(result.total).toBe(120);
      expect(result.resetAt).toEqual(new Date(resetTime));
      expect(mockRatelimitInstance.limit).toHaveBeenCalledWith(testKey);
    });

    test("should return limited when rate limit exceeded", async () => {
      mockRatelimitInstance.limit.mockResolvedValue({
        success: false,
        remaining: 0,
        limit: 120,
        reset: Date.now() + 60_000,
      });

      const result = await limiter.check(testKey);

      expect(result.limited).toBe(true);
      expect(result.remaining).toBe(0);
      expect(result.total).toBe(120);
    });

    test("should throw RateLimitException on error", async () => {
      mockRatelimitInstance.limit.mockRejectedValue(new Error("Upstash connection failed"));

      expect(limiter.check(testKey)).rejects.toThrow(RateLimitException);
      expect(limiter.check(testKey)).rejects.toThrow('Failed to check rate limit for key "user:123"');
    });

    test("should pass key directly to ratelimit.limit", async () => {
      await limiter.check("ip:192.168.1.1");

      expect(mockRatelimitInstance.limit).toHaveBeenCalledWith("ip:192.168.1.1");
    });

    test("should return resetAt as Date from timestamp", async () => {
      const resetTimestamp = 1700000000000;
      mockRatelimitInstance.limit.mockResolvedValue({
        success: true,
        remaining: 50,
        limit: 100,
        reset: resetTimestamp,
      });

      const result = await limiter.check(testKey);

      expect(result.resetAt).toEqual(new Date(resetTimestamp));
    });
  });

  describe("isLimited method", () => {
    test("should return false when not limited", async () => {
      mockRatelimitInstance.limit.mockResolvedValue({
        success: true,
        remaining: 99,
        limit: 120,
        reset: Date.now() + 60_000,
      });

      const result = await limiter.isLimited(testKey);

      expect(result).toBe(false);
    });

    test("should return true when limited", async () => {
      mockRatelimitInstance.limit.mockResolvedValue({
        success: false,
        remaining: 0,
        limit: 120,
        reset: Date.now() + 60_000,
      });

      const result = await limiter.isLimited(testKey);

      expect(result).toBe(true);
    });

    test("should delegate to check method", async () => {
      mockRatelimitInstance.limit.mockResolvedValue({
        success: true,
        remaining: 50,
        limit: 120,
        reset: Date.now() + 60_000,
      });

      await limiter.isLimited(testKey);

      expect(mockRatelimitInstance.limit).toHaveBeenCalledWith(testKey);
    });
  });

  describe("reset method", () => {
    test("should reset rate limit and return true", async () => {
      const result = await limiter.reset(testKey);

      expect(result).toBe(true);
      expect(mockRatelimitInstance.resetUsedTokens).toHaveBeenCalledWith(testKey);
    });

    test("should throw RateLimitException on error", async () => {
      mockRatelimitInstance.resetUsedTokens.mockRejectedValue(new Error("Reset failed"));

      expect(limiter.reset(testKey)).rejects.toThrow(RateLimitException);
      expect(limiter.reset(testKey)).rejects.toThrow('Failed to reset rate limit for key "user:123"');
    });

    test("should pass key directly to resetUsedTokens", async () => {
      await limiter.reset("ip:192.168.1.1");

      expect(mockRatelimitInstance.resetUsedTokens).toHaveBeenCalledWith("ip:192.168.1.1");
    });
  });

  describe("getCount method", () => {
    test("should return remaining count", async () => {
      mockRatelimitInstance.getRemaining.mockResolvedValue({ remaining: 75 });

      const result = await limiter.getCount(testKey);

      expect(result).toBe(75);
      expect(mockRatelimitInstance.getRemaining).toHaveBeenCalledWith(testKey);
    });

    test("should return 0 remaining", async () => {
      mockRatelimitInstance.getRemaining.mockResolvedValue({ remaining: 0 });

      const result = await limiter.getCount(testKey);

      expect(result).toBe(0);
    });

    test("should throw RateLimitException on error", async () => {
      mockRatelimitInstance.getRemaining.mockRejectedValue(new Error("Get remaining failed"));

      expect(limiter.getCount(testKey)).rejects.toThrow(RateLimitException);
      expect(limiter.getCount(testKey)).rejects.toThrow('Failed to get count for key "user:123"');
    });
  });

  describe("integration scenarios", () => {
    test("should handle rate limit workflow: check -> exceed -> reset -> check", async () => {
      // First check - not limited
      mockRatelimitInstance.limit.mockResolvedValue({
        success: true,
        remaining: 4,
        limit: 5,
        reset: Date.now() + 60_000,
      });
      let result = await limiter.check(testKey);
      expect(result.limited).toBe(false);
      expect(result.remaining).toBe(4);

      // Exceed limit
      mockRatelimitInstance.limit.mockResolvedValue({
        success: false,
        remaining: 0,
        limit: 5,
        reset: Date.now() + 60_000,
      });
      result = await limiter.check(testKey);
      expect(result.limited).toBe(true);
      expect(result.remaining).toBe(0);

      // Reset
      const resetResult = await limiter.reset(testKey);
      expect(resetResult).toBe(true);

      // Check again - should be reset
      mockRatelimitInstance.limit.mockResolvedValue({
        success: true,
        remaining: 4,
        limit: 5,
        reset: Date.now() + 60_000,
      });
      result = await limiter.check(testKey);
      expect(result.limited).toBe(false);
      expect(result.remaining).toBe(4);
    });

    test("should handle multiple keys independently", async () => {
      mockRatelimitInstance.limit
        .mockResolvedValueOnce({
          success: true,
          remaining: 50,
          limit: 100,
          reset: Date.now() + 60_000,
        })
        .mockResolvedValueOnce({
          success: false,
          remaining: 0,
          limit: 100,
          reset: Date.now() + 60_000,
        });

      const result1 = await limiter.check("user:1");
      const result2 = await limiter.check("user:2");

      expect(result1.remaining).toBe(50);
      expect(result1.limited).toBe(false);
      expect(result2.remaining).toBe(0);
      expect(result2.limited).toBe(true);
    });

    test("should handle concurrent checks", async () => {
      let callCount = 0;
      mockRatelimitInstance.limit.mockImplementation(async () => {
        callCount++;
        return {
          success: true,
          remaining: 120 - callCount,
          limit: 120,
          reset: Date.now() + 60_000,
        };
      });

      const results = await Promise.all([limiter.check(testKey), limiter.check(testKey), limiter.check(testKey)]);

      expect(results.every((r) => r.limited === false)).toBe(true);
      expect(mockRatelimitInstance.limit).toHaveBeenCalledTimes(3);
    });
  });
});
