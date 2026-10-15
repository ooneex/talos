import { AppEnv } from "@talosjs/app-env";
import { inject, injectable } from "@talosjs/container";
import type { ScalarType } from "@talosjs/types";
import { EventException } from "./EventException";
import type { IEventClient, PubSubMessageHandlerType, RedisPubSubOptionsType } from "./types";

type ChannelListenerType = (message: string, channel: string) => void;

/** First wait before a lost subscriber connection is rebuilt; it doubles on every failed attempt. */
const RESUBSCRIBE_BASE_DELAY_MS = 100;
/** Ceiling for that wait, so a long outage is retried at a steady pace instead of ever less often. */
const RESUBSCRIBE_MAX_DELAY_MS = 10_000;

@injectable()
export class RedisPubSubClient<Data extends Record<string, ScalarType>> implements IEventClient<Data> {
  private readonly client: Bun.RedisClient;
  private subscriber: Bun.RedisClient | null = null;
  private subscribing: Promise<Bun.RedisClient> | null = null;
  private connecting: Promise<void> | null = null;
  /** Every listener by channel, kept so a rebuilt subscriber can listen to them again. */
  private readonly listeners = new Map<string, ChannelListenerType[]>();
  /** Listeners the current subscriber already has, so none is registered twice on it. */
  private attached = new Set<ChannelListenerType>();
  private resubscribeTimer: ReturnType<typeof setTimeout> | null = null;
  private resubscribeAttempts = 0;
  private closed = false;

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

  /**
   * Bun's client gives up for good once its reconnect attempts run out, so a Redis outage would
   * otherwise fail every later publish until the process restarts. Reconnect on demand instead,
   * sharing one attempt between the calls that arrive while it is in flight.
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

  private async getSubscriber(): Promise<Bun.RedisClient> {
    if (this.subscriber) {
      return this.subscriber;
    }

    this.subscribing ??= this.createSubscriber().finally(() => {
      this.subscribing = null;
    });

    return await this.subscribing;
  }

  private async createSubscriber(): Promise<Bun.RedisClient> {
    const client = await this.connection();
    const subscriber = await client.duplicate();

    subscriber.onclose = () => this.handleSubscriberClose(subscriber);
    this.subscriber = subscriber;
    this.attached = new Set();

    return subscriber;
  }

  private async attach(subscriber: Bun.RedisClient, channel: string, listener: ChannelListenerType): Promise<void> {
    if (this.attached.has(listener)) {
      return;
    }

    this.attached.add(listener);

    try {
      await subscriber.subscribe(channel, listener);
    } catch (error) {
      this.attached.delete(listener);
      throw error;
    }
  }

  /**
   * A subscriber whose connection drops loses its channels on the server, and Bun may give up on it
   * for good. Drop it and rebuild a fresh one that listens to every channel again.
   */
  private handleSubscriberClose(subscriber: Bun.RedisClient): void {
    if (this.closed || this.subscriber !== subscriber) {
      return;
    }

    this.dropSubscriber();
    this.scheduleResubscribe();
  }

  private dropSubscriber(): void {
    const subscriber = this.subscriber;

    this.subscriber = null;
    this.attached = new Set();

    // Its onclose stays: Bun throws if the handler is cleared, and a dropped subscriber is ignored anyway
    subscriber?.close();
  }

  private scheduleResubscribe(): void {
    if (this.closed || this.resubscribeTimer) {
      return;
    }

    const delay = Math.min(RESUBSCRIBE_BASE_DELAY_MS * 2 ** this.resubscribeAttempts, RESUBSCRIBE_MAX_DELAY_MS);

    this.resubscribeTimer = setTimeout(() => {
      this.resubscribeTimer = null;
      void this.resubscribe();
    }, delay);
  }

  private async resubscribe(): Promise<void> {
    if (this.closed || this.listeners.size === 0) {
      return;
    }

    try {
      const subscriber = await this.getSubscriber();

      await Promise.all(
        [...this.listeners].flatMap(([channel, listeners]) =>
          listeners.map((listener) => this.attach(subscriber, channel, listener)),
        ),
      );
      this.resubscribeAttempts = 0;
    } catch {
      this.resubscribeAttempts++;
      this.dropSubscriber();
      this.scheduleResubscribe();
    }
  }

  public async publish(config: { channel: string; data: Data }): Promise<void> {
    try {
      const message = JSON.stringify(config.data);
      const client = await this.connection();
      await client.publish(config.channel, message);
    } catch (error) {
      throw new EventException(`Failed to publish message to channel "${config.channel}": ${error}`, "PUBLISH_FAILED");
    }
  }

  public async subscribe(channel: string, handler: PubSubMessageHandlerType<Data>): Promise<void> {
    const listener: ChannelListenerType = (message: string, ch: string) => {
      try {
        const data = JSON.parse(message) as Data;
        handler({ data, channel: ch });
      } catch {
        // Ignore malformed messages
      }
    };

    this.listeners.set(channel, [...(this.listeners.get(channel) ?? []), listener]);

    try {
      await this.attach(await this.getSubscriber(), channel, listener);
    } catch (error) {
      this.forget(channel, listener);
      throw new EventException(`Failed to subscribe to channel "${channel}": ${error}`, "SUBSCRIBE_FAILED");
    }
  }

  private forget(channel: string, listener: ChannelListenerType): void {
    const remaining = (this.listeners.get(channel) ?? []).filter((candidate) => candidate !== listener);

    if (remaining.length > 0) {
      this.listeners.set(channel, remaining);
    } else {
      this.listeners.delete(channel);
    }
  }

  public async unsubscribe(channel: string): Promise<void> {
    for (const listener of this.listeners.get(channel) ?? []) {
      this.attached.delete(listener);
    }

    this.listeners.delete(channel);

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
    this.listeners.clear();
    this.attached = new Set();

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
    this.closed = true;

    if (this.resubscribeTimer) {
      clearTimeout(this.resubscribeTimer);
      this.resubscribeTimer = null;
    }

    this.dropSubscriber();
    this.listeners.clear();
    this.client.close();
  }
}
