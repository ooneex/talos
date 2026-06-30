import type { ScalarType } from "@talosjs/types";

export type PubSubMessageHandlerType<Data extends Record<string, ScalarType> = Record<string, ScalarType>> = (context: {
  data: Data;
  channel: string;
}) => Promise<void> | void;

export type RedisPubSubOptionsType = {
  connectionString?: string;
  connectionTimeout?: number;
  idleTimeout?: number;
  autoReconnect?: boolean;
  maxRetries?: number;
  enableOfflineQueue?: boolean;
  enableAutoPipelining?: boolean;
  tls?: boolean | object;
};

export interface IEventClient<Data extends Record<string, ScalarType> = Record<string, ScalarType>> {
  publish: (config: { channel: string; data: Data }) => Promise<void>;
  subscribe: (channel: string, handler: PubSubMessageHandlerType<Data>) => Promise<void>;
  unsubscribe: (channel: string) => Promise<void>;
  unsubscribeAll: () => Promise<void>;
  close: () => void;
}

export interface IEvent<Data extends Record<string, ScalarType> = Record<string, ScalarType>> {
  getChannel: () => Promise<string> | string;
  handler: (context: { data: Data; channel: string }) => Promise<void> | void;
  publish: (data: Data) => Promise<void> | void;
  subscribe: () => Promise<void> | void;
  unsubscribe: () => Promise<void> | void;
  unsubscribeAll: () => Promise<void> | void;
}

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type EventClassType = new (...args: any[]) => IEvent;
