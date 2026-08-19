import { RedisClient } from "bun";
import { DatabaseException } from "./DatabaseException";
import type { RedisConnectionOptionsType } from "./types";

type RedisDatabaseConnectionType = {
  /** Server name used in the exception messages, e.g. `Redis` or `Dragonfly`. */
  label: string;
  /** Environment variable pointed at when no URL was given. */
  envKey: string;
};

/**
 * The connection lifecycle every RESP server shares. Dragonfly speaks the same protocol as Redis,
 * so the Bun Redis client drives both and only the names in the messages differ.
 */
export abstract class AbstractRedisDatabase {
  protected readonly client: RedisClient;
  protected readonly connectionUrl: string;
  private readonly label: string;

  protected constructor(
    connectionUrl: string,
    protected readonly options: RedisConnectionOptionsType,
    connection: RedisDatabaseConnectionType,
  ) {
    if (!connectionUrl) {
      throw new DatabaseException(
        `${connection.label} connection URL is required. Please provide a connection URL either through the constructor options or set the ${connection.envKey} environment variable.`,
        "CONNECTION_FAILED",
      );
    }

    this.label = connection.label;
    this.connectionUrl = connectionUrl;
    this.client = new RedisClient(connectionUrl, {
      connectionTimeout: options.connectionTimeout || 10_000,
      idleTimeout: options.idleTimeout || 0,
      autoReconnect: options.autoReconnect ?? true,
      maxRetries: options.maxRetries || 10,
      enableOfflineQueue: options.enableOfflineQueue ?? true,
      // RESP servers pipeline well, and Dragonfly serves a batch in parallel across its shards
      enableAutoPipelining: options.enableAutoPipelining ?? true,
      ...(options.tls !== undefined && { tls: options.tls }),
    });
  }

  public getClient(): RedisClient {
    return this.client;
  }

  public async open(): Promise<RedisClient> {
    try {
      if (!this.client.connected) {
        await this.client.connect();
      }

      return this.client;
    } catch (error) {
      throw new DatabaseException(
        `Failed to open ${this.label} connection: ${this.describe(error)}`,
        "OPERATION_FAILED",
        {
          connectionUrl: this.connectionUrl,
          options: this.options,
          error,
        },
      );
    }
  }

  public async close(): Promise<void> {
    try {
      if (this.client.connected) {
        this.client.close();
      }
    } catch (error) {
      throw new DatabaseException(
        `Failed to close ${this.label} connection: ${this.describe(error)}`,
        "OPERATION_FAILED",
        {
          connectionUrl: this.connectionUrl,
          error,
        },
      );
    }
  }

  public async ping(): Promise<boolean> {
    try {
      const client = await this.open();
      const result = await client.send("PING", []);

      return result === "PONG";
    } catch (error) {
      throw new DatabaseException(`Failed to ping ${this.label}: ${this.describe(error)}`, "OPERATION_FAILED", {
        connectionUrl: this.connectionUrl,
        error,
      });
    }
  }

  public async drop(): Promise<void> {
    try {
      if (!this.client.connected) {
        await this.open();
      }

      // FLUSHDB clears the selected database. Dragonfly rejects the ASYNC modifier — its flush is
      // already a fast, atomic, point-in-time operation, so the bare command is the right call.
      await this.client.send("FLUSHDB", []);
    } catch (error) {
      throw new DatabaseException(
        `Failed to drop ${this.label} database: ${this.describe(error)}`,
        "OPERATION_FAILED",
        {
          connectionUrl: this.connectionUrl,
          error,
        },
      );
    }
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
