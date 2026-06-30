import { AppEnv } from "@talosjs/app-env";
import { inject } from "@talosjs/container";
import { decorator } from "./decorators";
import { RateLimitException } from "./RateLimitException";
import type { IRateLimiter, RateLimitResultType, RedisRateLimiterOptionsType } from "./types";

@decorator.rateLimit()
export class RedisRateLimiter implements IRateLimiter {
  private readonly client: Bun.RedisClient;
  private readonly namespace: string;

  constructor(
    @inject(AppEnv) private readonly env: AppEnv,
    options: RedisRateLimiterOptionsType = {},
  ) {
    this.namespace = options.namespace ?? "ratelimit";
    const connectionString = options.connectionString || this.env.RATE_LIMIT_REDIS_URL;

    if (!connectionString) {
      throw new RateLimitException(
        "Redis connection string is required. Please provide a connection string either through the constructor options or set the RATE_LIMIT_REDIS_URL environment variable.",
        "RATE_LIMIT_CONNECTION_FAILED",
      );
    }

    const { connectionString: _, namespace: __, ...userOptions } = options;

    this.client = new Bun.RedisClient(connectionString, {
      // Max time (ms) to wait for initial connection
      connectionTimeout: 10_000,
      // Disable idle timeout to keep connection alive during traffic bursts
      idleTimeout: 0,
      // Automatically reconnect on connection loss
      autoReconnect: true,
      // Max reconnection attempts before giving up
      maxRetries: 10,
      // Queue commands while disconnected, flush on reconnect
      enableOfflineQueue: true,
      // Batch multiple commands into fewer round-trips
      enableAutoPipelining: true,
      ...userOptions,
    });
  }

  private getKey(key: string): string {
    return `${this.namespace}:${key}`;
  }

  public async check(key: string): Promise<RateLimitResultType> {
    const limit = 120;
    const windowSeconds = 60;
    try {
      const rateLimitKey = this.getKey(key);

      // Increment counter
      const count = await this.client.incr(rateLimitKey);

      // Set expiry if this is the first request in window
      if (count === 1) {
        await this.client.expire(rateLimitKey, windowSeconds);
      }

      // Get TTL for reset time calculation
      const ttl = await this.client.ttl(rateLimitKey);
      const resetAt = new Date(Date.now() + ttl * 1000);

      return {
        limited: count > limit,
        remaining: Math.max(0, limit - count),
        total: limit,
        resetAt,
      };
    } catch (error: unknown) {
      throw new RateLimitException(`Failed to check rate limit for key "${key}": ${error}`, "RATE_LIMIT_CHECK_FAILED");
    }
  }

  public async isLimited(key: string): Promise<boolean> {
    const result = await this.check(key);

    return result.limited;
  }

  public async reset(key: string): Promise<boolean> {
    try {
      const rateLimitKey = this.getKey(key);
      const result = await this.client.del(rateLimitKey);

      return result > 0;
    } catch (error: unknown) {
      throw new RateLimitException(`Failed to reset rate limit for key "${key}": ${error}`, "RATE_LIMIT_RESET_FAILED");
    }
  }

  public async getCount(key: string): Promise<number> {
    try {
      const rateLimitKey = this.getKey(key);
      const value = await this.client.get(rateLimitKey);

      if (value === null) {
        return 0;
      }

      return Number.parseInt(value, 10);
    } catch (error: unknown) {
      throw new RateLimitException(`Failed to get count for key "${key}": ${error}`, "RATE_LIMIT_COUNT_FAILED");
    }
  }
}
