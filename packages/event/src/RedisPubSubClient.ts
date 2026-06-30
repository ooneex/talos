import { AppEnv } from "@talosjs/app-env";
import { inject, injectable } from "@talosjs/container";
import type { ScalarType } from "@talosjs/types";
import { EventException } from "./EventException";
import type { IEventClient, PubSubMessageHandlerType, RedisPubSubOptionsType } from "./types";

@injectable()
export class RedisPubSubClient<Data extends Record<string, ScalarType>> implements IEventClient<Data> {
  private readonly client: Bun.RedisClient;
  private subscriber: Bun.RedisClient | null = null;

  constructor(
    @inject(AppEnv) private readonly env: AppEnv,
    options: RedisPubSubOptionsType = {},
  ) {
    const connectionString = options.connectionString || this.env.PUBSUB_REDIS_URL;

    if (!connectionString) {
      throw new EventException(
        "Redis connection string is required. Please provide a connection string either through the constructor options or set the PUBSUB_REDIS_URL environment variable.",
        "CONNECTION_FAILED",
      );
    }

    const { connectionString: _, ...userOptions } = options;

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

  public async publish(config: { channel: string; data: Data }): Promise<void> {
    try {
      const message = JSON.stringify(config.data);
      await this.client.publish(config.channel, message);
    } catch (error) {
      throw new EventException(`Failed to publish message to channel "${config.channel}": ${error}`, "PUBLISH_FAILED");
    }
  }

  public async subscribe(channel: string, handler: PubSubMessageHandlerType<Data>): Promise<void> {
    try {
      if (!this.subscriber) {
        this.subscriber = await this.client.duplicate();
      }

      await this.subscriber.subscribe(channel, (message: string, ch: string) => {
        try {
          const data = JSON.parse(message) as Data;
          handler({ data, channel: ch });
        } catch {
          // Ignore malformed messages
        }
      });
    } catch (error) {
      throw new EventException(`Failed to subscribe to channel "${channel}": ${error}`, "SUBSCRIBE_FAILED");
    }
  }

  public async unsubscribe(channel: string): Promise<void> {
    try {
      if (!this.subscriber) {
        return;
      }

      await this.subscriber.unsubscribe(channel);
    } catch (error) {
      throw new EventException(`Failed to unsubscribe from channel "${channel}": ${error}`, "UNSUBSCRIBE_FAILED");
    }
  }

  public async unsubscribeAll(): Promise<void> {
    try {
      if (!this.subscriber) {
        return;
      }

      await this.subscriber.unsubscribe();
    } catch (error) {
      throw new EventException(`Failed to unsubscribe from all channels: ${error}`, "UNSUBSCRIBE_ALL_FAILED");
    }
  }

  public close(): void {
    this.subscriber?.close();
    this.subscriber = null;
    this.client.close();
  }
}
