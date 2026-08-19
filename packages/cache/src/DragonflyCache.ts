import { AppEnv } from "@talosjs/app-env";
import { inject } from "@talosjs/container";
import { AbstractRedisCache } from "./AbstractRedisCache";
import { decorator } from "./decorators";
import type { DragonflyCacheOptionsType } from "./types";

/**
 * Dragonfly applies MATCH and TYPE filters after the keys are read from the bucket, so a small
 * COUNT makes most pages come back empty. A large hint keeps a full sweep to a few round-trips.
 */
const DEFAULT_SCAN_COUNT = 1000;

@decorator.cache()
export class DragonflyCache extends AbstractRedisCache {
  private readonly scanCount: number;

  constructor(@inject(AppEnv) env: AppEnv, options: DragonflyCacheOptionsType = {}) {
    super(options.connectionString || env.CACHE_DRAGONFLY_URL, options, {
      label: "Dragonfly",
      envKey: "CACHE_DRAGONFLY_URL",
    });
    this.scanCount = options.scanCount && options.scanCount > 0 ? options.scanCount : DEFAULT_SCAN_COUNT;
  }

  public async set<T = unknown>(key: string, value: T, ttl?: number): Promise<void> {
    const namespacedKey = this.getKey(key);
    const serializedValue = this.serialize(value);

    if (ttl && ttl > 0) {
      // Dragonfly sets the value and its expiry atomically, so a crash can never leave a key immortal
      await this.client.set(namespacedKey, serializedValue, "EX", Math.floor(ttl));

      return;
    }

    await this.client.set(namespacedKey, serializedValue);
  }

  public async delete(key: string): Promise<boolean> {
    const result = await this.client.unlink(this.getKey(key));

    return result > 0;
  }

  /**
   * Delete every string key the pattern matches, one SCAN page at a time, and say how many went.
   * SCAN may hand back the same key twice, so the count comes from the server, not from the page.
   */
  protected async deleteMatching(pattern: string): Promise<number> {
    let cursor = "0";
    let deleted = 0;

    // talos-ignore perf.await-in-loop: SCAN is a cursor — a page cannot be asked for before the one that returns it
    do {
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        this.scanCount,
        "TYPE",
        "string",
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        deleted += await this.client.unlink(...keys);
      }
    } while (cursor !== "0");

    return deleted;
  }
}
