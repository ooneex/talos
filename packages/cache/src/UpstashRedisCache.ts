import { AppEnv } from "@talosjs/app-env";
import { inject } from "@talosjs/container";
import { Redis } from "@upstash/redis";
import { AbstractCache } from "./AbstractCache";
import { CacheException } from "./CacheException";
import { decorator } from "./decorators";
import type { UpstashRedisCacheOptionsType } from "./types";

@decorator.cache()
export class UpstashRedisCache extends AbstractCache {
  private client: Redis;
  private readonly namespace: string;

  constructor(
    @inject(AppEnv) private readonly env: AppEnv,
    options: UpstashRedisCacheOptionsType = {},
  ) {
    super();
    this.namespace = options.namespace ?? "cache";
    const url = options.url || this.env.CACHE_UPSTASH_REDIS_REST_URL;
    const token = options.token || this.env.CACHE_UPSTASH_REDIS_REST_TOKEN;

    if (!url) {
      throw new CacheException(
        "Upstash Redis REST URL is required. Please provide a URL either through the constructor options or set the CACHE_UPSTASH_REDIS_REST_URL environment variable.",
        "CONFIG_REQUIRED",
      );
    }

    if (!token) {
      throw new CacheException(
        "Upstash Redis REST token is required. Please provide a token either through the constructor options or set the CACHE_UPSTASH_REDIS_REST_TOKEN environment variable.",
        "CONFIG_REQUIRED",
      );
    }

    this.client = new Redis({ url, token });
  }

  private getKey(key: string): string {
    return `${this.namespace}:${key}`;
  }

  public async get<T = unknown>(key: string): Promise<T | undefined> {
    const value = await this.client.get<T>(this.getKey(key));

    if (value === null) {
      return;
    }

    return value;
  }

  public async set<T = unknown>(key: string, value: T, ttl?: number): Promise<void> {
    const normalizedValue = value === undefined ? null : value;
    const namespacedKey = this.getKey(key);

    if (ttl && ttl > 0) {
      await this.client.set(namespacedKey, normalizedValue, { ex: ttl });
    } else {
      await this.client.set(namespacedKey, normalizedValue);
    }
  }

  public async delete(key: string): Promise<boolean> {
    const result = await this.client.del(this.getKey(key));

    return result > 0;
  }

  public async has(key: string): Promise<boolean> {
    const result = await this.client.exists(this.getKey(key));

    return result > 0;
  }

  /**
   * Delete every key the pattern matches, one SCAN page at a time, and say how many went.
   */
  private async deleteMatching(match: string): Promise<number> {
    let cursor = "0";
    let deleted = 0;

    // talos-ignore perf.await-in-loop: SCAN is a cursor — a page cannot be asked for before the one that returns it
    do {
      const [nextCursor, keys] = await this.client.scan(cursor, { match, count: 100 });
      cursor = nextCursor;

      if (keys.length > 0) {
        await this.client.del(...keys);
        deleted += keys.length;
      }
    } while (cursor !== "0");

    return deleted;
  }

  public async deleteByPrefix(prefix: string): Promise<number> {
    return await this.deleteMatching(`${this.namespace}:${prefix}*`);
  }

  public async clear(): Promise<void> {
    await this.deleteMatching(`${this.namespace}:*`);
  }
}
