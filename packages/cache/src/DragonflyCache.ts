import { AppEnv } from "@talosjs/app-env";
import { inject } from "@talosjs/container";
import { AbstractCache } from "./AbstractCache";
import { CacheException } from "./CacheException";
import { decorator } from "./decorators";
import type { DragonflyCacheOptionsType } from "./types";

/**
 * Dragonfly applies MATCH and TYPE filters after the keys are read from the bucket, so a small
 * COUNT makes most pages come back empty. A large hint keeps a full sweep to a few round-trips.
 */
const DEFAULT_SCAN_COUNT = 1000;

@decorator.cache()
export class DragonflyCache extends AbstractCache {
  private readonly client: Bun.RedisClient;
  private readonly namespace: string | null;
  private readonly scanCount: number;

  constructor(
    @inject(AppEnv) private readonly env: AppEnv,
    options: DragonflyCacheOptionsType = {},
  ) {
    super();
    this.namespace = options.namespace ?? "cache";
    this.scanCount = options.scanCount && options.scanCount > 0 ? options.scanCount : DEFAULT_SCAN_COUNT;
    const connectionString = options.connectionString || this.env.CACHE_DRAGONFLY_URL;

    if (!connectionString) {
      throw new CacheException(
        "Dragonfly connection string is required. Please provide a connection string either through the constructor options or set the CACHE_DRAGONFLY_URL environment variable.",
        "URL_REQUIRED",
      );
    }

    const { connectionString: _, namespace: __, scanCount: ___, ...userOptions } = options;

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
      // Dragonfly is multi-threaded, so pipelined batches are served in parallel across shards
      enableAutoPipelining: true,
      ...userOptions,
    });
  }

  private getKey(key: string): string {
    return this.namespace ? `${this.namespace}:${key}` : key;
  }

  public async get<T = unknown>(key: string): Promise<T | undefined> {
    const value = await this.client.get(this.getKey(key));

    if (value === null) {
      return;
    }

    try {
      return JSON.parse(value);
    } catch {
      return value as T;
    }
  }

  public async set<T = unknown>(key: string, value: T, ttl?: number): Promise<void> {
    const namespacedKey = this.getKey(key);
    const normalizedValue = value === undefined ? null : value;
    const serializedValue = typeof normalizedValue === "string" ? normalizedValue : JSON.stringify(normalizedValue);

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

  public async has(key: string): Promise<boolean> {
    const result = await this.client.exists(this.getKey(key));

    return result;
  }

  /**
   * Delete every string key the pattern matches, one SCAN page at a time, and say how many went.
   * SCAN may hand back the same key twice, so the count comes from the server, not from the page.
   */
  private async deleteMatching(pattern: string): Promise<number> {
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

  public async deleteByPrefix(prefix: string): Promise<number> {
    return await this.deleteMatching(this.namespace ? `${this.namespace}:${prefix}*` : `${prefix}*`);
  }

  public async clear(): Promise<void> {
    await this.deleteMatching(this.namespace ? `${this.namespace}:*` : "*");
  }
}
