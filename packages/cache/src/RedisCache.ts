import { AppEnv } from "@talosjs/app-env";
import { inject } from "@talosjs/container";
import { AbstractRedisCache } from "./AbstractRedisCache";
import { decorator } from "./decorators";
import type { RedisCacheOptionsType } from "./types";

/** Redis filters a SCAN page after reading it, so a modest page keeps each round-trip short. */
const SCAN_COUNT = 100;

@decorator.cache()
export class RedisCache extends AbstractRedisCache {
  constructor(@inject(AppEnv) env: AppEnv, options: RedisCacheOptionsType = {}) {
    super(options.connectionString || env.CACHE_REDIS_URL, options, {
      label: "Redis",
      envKey: "CACHE_REDIS_URL",
    });
  }

  public async set<T = unknown>(key: string, value: T, ttl?: number): Promise<void> {
    const namespacedKey = this.getKey(key);

    await this.client.set(namespacedKey, this.serialize(value));

    if (ttl && ttl > 0) {
      await this.client.expire(namespacedKey, ttl);
    }
  }

  public async delete(key: string): Promise<boolean> {
    const result = await this.client.del(this.getKey(key));

    return result > 0;
  }

  /**
   * Delete every key the pattern matches, one SCAN page at a time, and say how many went.
   */
  protected async deleteMatching(pattern: string): Promise<number> {
    let cursor = "0";
    let deleted = 0;

    // talos-ignore perf.await-in-loop: SCAN is a cursor — a page cannot be asked for before the one that returns it
    do {
      const [nextCursor, keys] = await this.client.scan(cursor, "MATCH", pattern, "COUNT", SCAN_COUNT);
      cursor = nextCursor;

      if (keys.length > 0) {
        await this.client.del(...keys);
        deleted += keys.length;
      }
    } while (cursor !== "0");

    return deleted;
  }
}
