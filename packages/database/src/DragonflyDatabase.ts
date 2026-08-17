import { AppEnv } from "@talosjs/app-env";
import { inject, injectable } from "@talosjs/container";
import { RedisClient } from "bun";
import { DatabaseException } from "./DatabaseException";
import type { DragonflyConnectionOptionsType, IDragonflyDatabase } from "./types";

@injectable()
export class DragonflyDatabase implements IDragonflyDatabase {
  private client: RedisClient;
  private connectionUrl: string;

  constructor(
    @inject(AppEnv) private readonly env: AppEnv,
    private readonly options: DragonflyConnectionOptionsType = {},
  ) {
    this.connectionUrl = options.url || this.env.DATABASE_DRAGONFLY_URL || "";

    if (!this.connectionUrl) {
      throw new DatabaseException(
        "Dragonfly connection URL is required. Please provide a connection URL either through the constructor options or set the DATABASE_DRAGONFLY_URL environment variable.",
        "CONNECTION_FAILED",
      );
    }

    // Dragonfly speaks RESP, so the Bun Redis client drives it as-is
    this.client = new RedisClient(this.connectionUrl, {
      connectionTimeout: options.connectionTimeout || 10_000,
      idleTimeout: options.idleTimeout || 0,
      autoReconnect: options.autoReconnect ?? true,
      maxRetries: options.maxRetries || 10,
      enableOfflineQueue: options.enableOfflineQueue ?? true,
      // Dragonfly is multi-threaded, so a pipelined batch is served in parallel across shards
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
        `Failed to open Dragonfly connection: ${error instanceof Error ? error.message : String(error)}`,
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
        `Failed to close Dragonfly connection: ${error instanceof Error ? error.message : String(error)}`,
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
      throw new DatabaseException(
        `Failed to ping Dragonfly: ${error instanceof Error ? error.message : String(error)}`,
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

      // FLUSHDB clears the selected database. Dragonfly rejects the ASYNC modifier — its flush is
      // already a fast, atomic, point-in-time operation, so the bare command is the right call.
      await this.client.send("FLUSHDB", []);
    } catch (error) {
      throw new DatabaseException(
        `Failed to drop Dragonfly database: ${error instanceof Error ? error.message : String(error)}`,
        "OPERATION_FAILED",
        {
          connectionUrl: this.connectionUrl,
          error,
        },
      );
    }
  }
}
