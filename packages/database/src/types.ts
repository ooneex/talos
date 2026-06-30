import type { RedisClient } from "bun";
import type { EntityTarget, ObjectLiteral, Repository } from "typeorm";

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type DatabaseClassType = new (...args: any[]) => IDatabase | IRedisDatabase | ITypeormDatabase;

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type RedisDatabaseClassType = new (...args: any[]) => IRedisDatabase;

export type RedisConnectionOptionsType = {
  url?: string;
  connectionTimeout?: number;
  idleTimeout?: number;
  autoReconnect?: boolean;
  maxRetries?: number;
  enableOfflineQueue?: boolean;
  enableAutoPipelining?: boolean;
  tls?:
    | boolean
    | {
        rejectUnauthorized?: boolean;
        ca?: string;
        cert?: string;
        key?: string;
      };
};

export interface IDatabase {
  open: () => Promise<void>;
  close: () => Promise<void>;
  drop: () => Promise<void>;
}

export interface IRedisDatabase {
  open: () => Promise<RedisClient>;
  close: () => Promise<void>;
  drop: () => Promise<void>;
}

export interface ITypeormDatabase {
  open: <Entity extends ObjectLiteral>(entity: EntityTarget<Entity>, database?: string) => Promise<Repository<Entity>>;
  close: () => Promise<void>;
  drop: () => Promise<void>;
}
