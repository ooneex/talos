import { AppEnv } from "@talosjs/app-env";
import { inject } from "@talosjs/container";
import { decorator } from "./decorators";
import { RateLimitException } from "./RateLimitException";
import type { DragonflyRateLimiterOptionsType, IRateLimiter, RateLimitResultType } from "./types";

const LIMIT = 1000;
const WINDOW_SECONDS = 60;

@decorator.rateLimit()
export class DragonflyRateLimiter implements IRateLimiter {
  private readonly client: Bun.RedisClient;
  private readonly namespace: string;
  private connecting: Promise<void> | null = null;

  constructor(
    @inject(AppEnv) private readonly env: AppEnv,
    options: DragonflyRateLimiterOptionsType = {},
  ) {
    this.namespace = options.namespace ?? "ratelimit";
    const connectionString = options.connectionString || this.env.RATE_LIMIT_DRAGONFLY_URL;

    if (!connectionString) {
      throw new RateLimitException(
        "Dragonfly connection string is required. Please provide a connection string either through the constructor options or set the RATE_LIMIT_DRAGONFLY_URL environment variable.",
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

  /**
   * Bun's client gives up for good once its reconnect attempts run out, so a Dragonfly outage would
   * otherwise fail every later check until the process restarts. Reconnect on demand instead,
   * sharing one attempt between the commands that arrive while it is in flight.
   */
  private async connection(): Promise<Bun.RedisClient> {
    if (!this.client.connected) {
      this.connecting ??= this.client.connect().finally(() => {
        this.connecting = null;
      });
      await this.connecting;
    }

    return this.client;
  }

  private getKey(key: string): string {
    return `${this.namespace}:${key}`;
  }

  public async check(key: string): Promise<RateLimitResultType> {
    try {
      const rateLimitKey = this.getKey(key);
      const client = await this.connection();

      /**
       * EXPIRE NX only arms a key that has no expiry yet, so it runs on every check: a crash between
       * INCR and EXPIRE can never leave a counter immortal, and the window is never pushed back.
       * The three commands are issued together and pipelined into a single round-trip.
       */
      const [count, , ttl] = await Promise.all([
        client.incr(rateLimitKey),
        client.send("EXPIRE", [rateLimitKey, String(WINDOW_SECONDS), "NX"]),
        client.ttl(rateLimitKey),
      ]);

      const resetAt = new Date(Date.now() + Math.max(0, ttl) * 1000);

      return {
        limited: count > LIMIT,
        remaining: Math.max(0, LIMIT - count),
        total: LIMIT,
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
      const client = await this.connection();
      // UNLINK frees the counter off the request path, Dragonfly's preferred way to delete
      const result = await client.unlink(this.getKey(key));

      return result > 0;
    } catch (error: unknown) {
      throw new RateLimitException(`Failed to reset rate limit for key "${key}": ${error}`, "RATE_LIMIT_RESET_FAILED");
    }
  }

  public async getCount(key: string): Promise<number> {
    try {
      const client = await this.connection();
      const value = await client.get(this.getKey(key));

      if (value === null) {
        return 0;
      }

      return Number.parseInt(value, 10);
    } catch (error: unknown) {
      throw new RateLimitException(`Failed to get count for key "${key}": ${error}`, "RATE_LIMIT_COUNT_FAILED");
    }
  }
}
