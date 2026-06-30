import { AppEnv } from "@talosjs/app-env";
import { inject, injectable } from "@talosjs/container";
import { RedisClient } from "bun";
import { DatabaseException } from "./DatabaseException";
import type { IRedisDatabase, RedisConnectionOptionsType } from "./types";

@injectable()
export class RedisDatabase implements IRedisDatabase {
  private client: RedisClient;
  private connectionUrl: string;

  constructor(
    @inject(AppEnv) private readonly env: AppEnv,
    private readonly options: RedisConnectionOptionsType = {},
  ) {
    this.connectionUrl = options.url || this.env.DATABASE_REDIS_URL || "";

    if (!this.connectionUrl) {
      throw new DatabaseException(
        "Redis connection URL is required. Please provide a connection URL either through the constructor options or set the DATABASE_REDIS_URL environment variable.",
        "CONNECTION_FAILED",
      );
    }

    // Create Redis client with options
    this.client = new RedisClient(this.connectionUrl, {
      connectionTimeout: options.connectionTimeout || 10_000,
      idleTimeout: options.idleTimeout || 0,
      autoReconnect: options.autoReconnect ?? true,
      maxRetries: options.maxRetries || 10,
      enableOfflineQueue: options.enableOfflineQueue ?? true,
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
        `Failed to open Redis connection: ${error instanceof Error ? error.message : String(error)}`,
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
        `Failed to close Redis connection: ${error instanceof Error ? error.message : String(error)}`,
        "OPERATION_FAILED",
        {
          connectionUrl: this.connectionUrl,
          error,
        },
      );
    }
  }

  public async drop(): Promise<void> {
    try {
      if (!this.client.connected) {
        await this.open();
      }

      // Use FLUSHDB to clear the current database
      await this.client.send("FLUSHDB", []);
    } catch (error) {
      throw new DatabaseException(
        `Failed to drop Redis database: ${error instanceof Error ? error.message : String(error)}`,
        "OPERATION_FAILED",
        {
          connectionUrl: this.connectionUrl,
          error,
        },
      );
    }
  }
}
