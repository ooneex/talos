import type { ScalarType } from "@talosjs/types";

export const Cache = {
  /**
   * Build the cache key of a route from the request that hits it. The user id
   * takes part in the key so a cached response never leaks across users.
   */
  keyFromRoute: (prefix: string, method: string, url: string, userId?: string): string => {
    const { pathname, search } = new URL(url);
    const keySource = `${method}:${pathname}:${search}:${userId ?? "anon"}`;
    return `${prefix}:${Bun.CryptoHasher.hash("sha256", keySource, "hex")}`;
  },

  /**
   * Build the cache key of a socket route. A socket message carries its inputs
   * in the payload rather than in the url, so they take part in the key.
   */
  keyFromSocketRoute: (
    prefix: string,
    routeName: string,
    userId?: string,
    params?: Record<string, ScalarType>,
    queries?: Record<string, ScalarType>,
    payload?: Record<string, ScalarType>,
  ): string => {
    const keySource = `${routeName}:${userId ?? "anon"}:${JSON.stringify(params ?? {})}:${JSON.stringify(queries ?? {})}:${JSON.stringify(payload ?? {})}`;
    return `${prefix}:${Bun.CryptoHasher.hash("sha256", keySource, "hex")}`;
  },
};
