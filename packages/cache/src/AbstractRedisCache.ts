import { AbstractCache } from "./AbstractCache";
import { CacheException } from "./CacheException";
import type { DragonflyCacheOptionsType } from "./types";

type RedisCacheConnectionType = {
  /** Server name used in the connection error, e.g. `Redis` or `Dragonfly`. */
  label: string;
  /** Environment variable pointed at when no connection string was given. */
  envKey: string;
};

/**
 * What every Bun RedisClient-backed cache shares: the connection, the namespace, and the reads that
 * come back the same whichever server answers them. Writes and deletes are where the servers part
 * ways, so subclasses own those and the SCAN sweep behind `deleteMatching`.
 */
export abstract class AbstractRedisCache extends AbstractCache {
  protected readonly client: Bun.RedisClient;
  protected readonly namespace: string | null;

  protected constructor(
    connectionString: string | undefined,
    // scanCount is read here only to keep it out of the client options — it tunes the sweep, not the connection
    options: DragonflyCacheOptionsType,
    connection: RedisCacheConnectionType,
  ) {
    super();

    if (!connectionString) {
      throw new CacheException(
        `${connection.label} connection string is required. Please provide a connection string either through the constructor options or set the ${connection.envKey} environment variable.`,
        "URL_REQUIRED",
      );
    }

    this.namespace = options.namespace ?? "cache";

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
      // Batch multiple commands into fewer round-trips
      enableAutoPipelining: true,
      ...userOptions,
    });
  }

  protected getKey(key: string): string {
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

  /** Strings go over the wire as-is; anything else is JSON, with `undefined` stored as `null`. */
  protected serialize<T = unknown>(value: T): string {
    const normalizedValue = value === undefined ? null : value;

    return typeof normalizedValue === "string" ? normalizedValue : JSON.stringify(normalizedValue);
  }

  public async has(key: string): Promise<boolean> {
    const result = await this.client.exists(this.getKey(key));

    return result;
  }

  public async deleteByPrefix(prefix: string): Promise<number> {
    return await this.deleteMatching(this.namespace ? `${this.namespace}:${prefix}*` : `${prefix}*`);
  }

  public async clear(): Promise<void> {
    await this.deleteMatching(this.namespace ? `${this.namespace}:*` : "*");
  }

  /**
   * Delete every key the pattern matches, one SCAN page at a time, and say how many went.
   */
  protected abstract deleteMatching(pattern: string): Promise<number>;
}
