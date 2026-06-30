import type { CacheClassType } from "@talosjs/cache";
import type { CronClassType } from "@talosjs/cron";
import type { LoggerClassType } from "@talosjs/logger";
import type { MiddlewareClassType, SocketMiddlewareClassType } from "@talosjs/middleware";
import type { RateLimiterClassType } from "@talosjs/rate-limit";
import type { Server } from "bun";

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type AppEventStartClassType = new (...args: any[]) => IAppEventStart;

export interface IAppEventStart {
  handle: (server: Server<unknown>) => void | Promise<void>;
}

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
};
