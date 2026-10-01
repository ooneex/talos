import type { CacheClassType } from "@talosjs/cache";
import type { CronClassType } from "@talosjs/cron";
import type { LoggerClassType } from "@talosjs/logger";
import type { MiddlewareClassType, SocketMiddlewareClassType } from "@talosjs/middleware";
import type { RateLimiterClassType } from "@talosjs/rate-limit";
import type { Server, TLSOptions, WebSocketCompressor } from "bun";

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type AppEventStartClassType = new (...args: any[]) => IAppEventStart;

export interface IAppEventStart {
  handle: (server: Server<unknown>) => void | Promise<void>;
}

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type AppEventStopClassType = new (...args: any[]) => IAppEventStop;

export interface IAppEventStop {
  handle: (server: Server<unknown>) => void | Promise<void>;
}

export type AppWebSocketConfigType = {
  /**
   * Sets the maximum size of messages in bytes.
   *
   * @default 1024 * 1024 * 16 (16 MB)
   */
  maxPayloadLength?: number;
  /**
   * Sets the maximum number of bytes that can be buffered on a single connection.
   *
   * @default 1024 * 1024 * 16 (16 MB)
   */
  backpressureLimit?: number;
  /**
   * Sets if the connection should be closed if `backpressureLimit` is reached.
   *
   * @default false
   */
  closeOnBackpressureLimit?: boolean;
  /**
   * Sets the number of seconds to wait before timing out a connection due to
   * no activity.
   *
   * @default 120
   */
  idleTimeout?: number;
  /**
   * Should `ws.publish()` also send a message to `ws` (itself), if it is subscribed?
   *
   * @default false
   */
  publishToSelf?: boolean;
  /**
   * Should the server automatically send and respond to pings to clients?
   *
   * @default true
   */
  sendPings?: boolean;
  /**
   * Sets the compression level for messages, for clients that support it.
   *
   * @default true
   */
  perMessageDeflate?:
    | boolean
    | {
        compress?: WebSocketCompressor | boolean;
        decompress?: WebSocketCompressor | boolean;
      };
};

export type AppServerConfigType = {
  /**
   * Sets the maximum size of an HTTP request body in bytes. Larger bodies are
   * rejected by Bun with a 413.
   *
   * @default 1024 * 1024 * 128 (128 MB)
   */
  maxRequestBodySize?: number;
  /**
   * Sets the number of seconds to wait before closing an inactive connection.
   * The maximum value is `255`, and `0` disables the timeout.
   *
   * @default 10
   */
  idleTimeout?: number;
  /**
   * Sets the TLS options used to serve HTTPS. Pass an array to serve several
   * certificates selected by SNI.
   */
  tls?: TLSOptions | TLSOptions[];
  /**
   * Serves HTTP/1.1. Set to `false` together with `http2` and/or `http3` to
   * refuse HTTP/1.x clients (this also disables WebSocket upgrades).
   *
   * @default true
   */
  http1?: boolean;
  /**
   * Also serves HTTP/2 on the same port.
   *
   * @default false
   * @experimental
   */
  http2?: boolean;
  /**
   * Also listens for HTTP/3 (QUIC) on the same port. Requires `tls`.
   *
   * @default false
   * @experimental
   */
  http3?: boolean;
  /**
   * Sets the `SO_REUSEPORT` flag so several processes can bind the same port.
   *
   * @default false
   */
  reusePort?: boolean;
  /**
   * Sets the `IPV6_V6ONLY` flag.
   *
   * @default false
   */
  ipv6Only?: boolean;
  /**
   * Identifies the server instance so `bun --hot` can reload it without
   * dropping pending requests. Set to `null` to disable hot reloading.
   */
  id?: string | null;
};

export type AppConfigType = {
  routing: {
    prefix: string;
  };
  loggers: LoggerClassType[];
  onException?: LoggerClassType;
  cache?: CacheClassType;
  rateLimiter?: RateLimiterClassType;
  cronJobs?: CronClassType[];
  middlewares?: MiddlewareClassType[] | SocketMiddlewareClassType[];
  cors?: MiddlewareClassType;
  onStart?: AppEventStartClassType;
  /**
   * Runs when the process receives `SIGINT` or `SIGTERM`, before it exits.
   * Receives the server so it can stop it and release resources.
   */
  onStop?: AppEventStopClassType;
  websocket?: AppWebSocketConfigType;
  server?: AppServerConfigType;
};
