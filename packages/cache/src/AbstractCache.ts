import type { ICache } from "./types";

export abstract class AbstractCache implements ICache {
  public abstract get<T = unknown>(key: string): Promise<T | undefined>;
  public abstract set<T = unknown>(key: string, value: T, ttl?: number): Promise<void>;
  public abstract delete(key: string): Promise<boolean>;
  public abstract deleteByPrefix(prefix: string): Promise<number>;
  public abstract has(key: string): Promise<boolean>;
  public abstract clear(): Promise<void>;
}
