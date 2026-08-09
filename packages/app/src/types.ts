import type { CacheClassType } from "@talosjs/cache";
import type { CronClassType } from "@talosjs/cron";
import type { LoggerClassType } from "@talosjs/logger";
import type { MiddlewareClassType, SocketMiddlewareClassType } from "@talosjs/middleware";
import type { RateLimiterClassType } from "@talosjs/rate-limit";
import type { Server, WebSocketCompressor } from "bun";

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type AppEventStartClassType = new (...args: any[]) => IAppEventStart;

export interface IAppEventStart {
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
  websocket?: AppWebSocketConfigType;
};
