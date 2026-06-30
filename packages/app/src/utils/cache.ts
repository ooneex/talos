import type { ICache } from "@talosjs/cache";
import { logSwallowedError } from "./logging";

export const DEFAULT_CACHE_TTL = 300;

export const safeCacheGet = async <T>(cache: ICache, key: string): Promise<T | undefined> => {
  try {
    return await cache.get<T>(key);
  } catch (error: unknown) {
    logSwallowedError("Cache read", error);
    return undefined;
  }
};

export const safeCacheSet = async <T>(
  cache: ICache,
  key: string,
  value: T,
  ttl: number = DEFAULT_CACHE_TTL,
): Promise<void> => {
  try {
    await cache.set(key, value, ttl);
  } catch (error: unknown) {
    logSwallowedError("Cache write", error);
  }
};
