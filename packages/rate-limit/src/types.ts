import type { Duration } from "@upstash/ratelimit";

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type RateLimiterClassType = new (...args: any[]) => IRateLimiter;

export type RedisRateLimiterOptionsType = {
  namespace?: string;
  connectionString?: string;
  connectionTimeout?: number;
  idleTimeout?: number;
  autoReconnect?: boolean;
  maxRetries?: number;
  enableOfflineQueue?: boolean;
  enableAutoPipelining?: boolean;
  tls?: boolean | object;
};

export type UpstashAlgorithmType =
  | { type: "fixedWindow"; limit: number; window: Duration }
  | { type: "slidingWindow"; limit: number; window: Duration }
  | { type: "tokenBucket"; refillRate: number; interval: Duration; maxTokens: number };

export type UpstashRedisRateLimiterOptionsType = {
  namespace?: string;
  url?: string;
  token?: string;
  algorithm?: UpstashAlgorithmType;
  prefix?: string;
  analytics?: boolean;
};

export type RateLimitResultType = {
  limited: boolean;
  remaining: number;
  total: number;
  resetAt: Date;
};

export interface IRateLimiter {
  check: (key: string) => Promise<RateLimitResultType>;
  isLimited: (key: string) => Promise<boolean>;
  reset: (key: string) => Promise<boolean>;
  getCount: (key: string) => Promise<number>;
}
