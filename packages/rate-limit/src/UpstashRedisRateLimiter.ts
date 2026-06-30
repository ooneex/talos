import { AppEnv } from "@talosjs/app-env";
import { inject } from "@talosjs/container";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { decorator } from "./decorators";
import { RateLimitException } from "./RateLimitException";
import type {
  IRateLimiter,
  RateLimitResultType,
  UpstashAlgorithmType,
  UpstashRedisRateLimiterOptionsType,
} from "./types";

@decorator.rateLimit()
export class UpstashRedisRateLimiter implements IRateLimiter {
  private ratelimit: Ratelimit;
  // Default: 120 requests per 60-second sliding window (high traffic)
  private static readonly DEFAULT_ALGORITHM: UpstashAlgorithmType = {
    type: "slidingWindow",
    limit: 120,
    window: "60 s",
  };

  constructor(
    @inject(AppEnv) private readonly env: AppEnv,
    options: UpstashRedisRateLimiterOptionsType = {},
  ) {
    const url = options.url || this.env.RATE_LIMIT_UPSTASH_REDIS_URL;
    const token = options.token || this.env.RATE_LIMIT_UPSTASH_REDIS_TOKEN;

    if (!url) {
      throw new RateLimitException(
        "Upstash Redis REST URL is required. Please provide a URL either through the constructor options or set the RATE_LIMIT_UPSTASH_REDIS_URL environment variable.",
        "CONFIG_REQUIRED",
      );
    }

    if (!token) {
      throw new RateLimitException(
        "Upstash Redis REST token is required. Please provide a token either through the constructor options or set the RATE_LIMIT_UPSTASH_REDIS_TOKEN environment variable.",
        "CONFIG_REQUIRED",
      );
    }

    const redis = new Redis({ url, token });
    const limiter = this.buildLimiter(options.algorithm);

    this.ratelimit = new Ratelimit({
      redis,
      limiter,
      prefix: options.prefix ?? options.namespace ?? "ratelimit",
      analytics: options.analytics ?? true,
    });
  }

  private buildLimiter(algorithm: UpstashAlgorithmType = UpstashRedisRateLimiter.DEFAULT_ALGORITHM) {
    switch (algorithm.type) {
      case "fixedWindow":
        return Ratelimit.fixedWindow(algorithm.limit, algorithm.window);
      case "slidingWindow":
        return Ratelimit.slidingWindow(algorithm.limit, algorithm.window);
      case "tokenBucket":
        return Ratelimit.tokenBucket(algorithm.refillRate, algorithm.interval, algorithm.maxTokens);
    }
  }

  public async check(key: string): Promise<RateLimitResultType> {
    try {
      const result = await this.ratelimit.limit(key);

      return {
        limited: !result.success,
        remaining: result.remaining,
        total: result.limit,
        resetAt: new Date(result.reset),
      };
    } catch (error) {
      throw new RateLimitException(`Failed to check rate limit for key "${key}": ${error}`, "RATE_LIMIT_CHECK_FAILED");
    }
  }

  public async isLimited(key: string): Promise<boolean> {
    const result = await this.check(key);

    return result.limited;
  }

  public async reset(key: string): Promise<boolean> {
    try {
      await this.ratelimit.resetUsedTokens(key);

      return true;
    } catch (error) {
      throw new RateLimitException(`Failed to reset rate limit for key "${key}": ${error}`, "RATE_LIMIT_RESET_FAILED");
    }
  }

  public async getCount(key: string): Promise<number> {
    try {
      const { remaining } = await this.ratelimit.getRemaining(key);

      return remaining;
    } catch (error) {
      throw new RateLimitException(`Failed to get count for key "${key}": ${error}`, "RATE_LIMIT_COUNT_FAILED");
    }
  }
}
