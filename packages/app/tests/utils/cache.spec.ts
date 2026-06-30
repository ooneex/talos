import { describe, expect, mock, test } from "bun:test";
import type { ICache } from "@talosjs/cache";
import { container } from "@talosjs/container";
import { DEFAULT_CACHE_TTL, safeCacheGet, safeCacheSet } from "@/utils/cache";
import { createMockLogger } from "./helpers";

const createMockCache = (overrides: Record<string, unknown> = {}): ICache =>
  ({
    get: mock(() => Promise.resolve(undefined)),
    set: mock(() => Promise.resolve()),
    has: mock(() => Promise.resolve(false)),
    delete: mock(() => Promise.resolve(false)),
    ...overrides,
  }) as unknown as ICache;

describe("safeCacheGet", () => {
  test("returns the cached value", async () => {
    const cache = createMockCache({ get: mock(() => Promise.resolve("cached-value")) });

    const result = await safeCacheGet<string>(cache, "key");

    expect(result).toBe("cached-value");
    expect(cache.get).toHaveBeenCalledWith("key");
  });

  test("returns undefined and logs through the container logger when the read throws", async () => {
    const logger = createMockLogger();
    container.addConstant("logger", logger);

    const cache = createMockCache({ get: mock(() => Promise.reject(new Error("backend down"))) });

    const result = await safeCacheGet<string>(cache, "key");

    expect(result).toBeUndefined();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect((logger.error.mock.calls as unknown[][])[0]?.[0]).toContain("backend down");

    container.removeConstant("logger");
  });
});

describe("safeCacheSet", () => {
  test("writes the value with the given ttl", async () => {
    const cache = createMockCache();

    await safeCacheSet(cache, "key", "value", 60);

    expect(cache.set).toHaveBeenCalledWith("key", "value", 60);
  });

  test("defaults the ttl to DEFAULT_CACHE_TTL", async () => {
    const cache = createMockCache();

    await safeCacheSet(cache, "key", "value");

    expect(cache.set).toHaveBeenCalledWith("key", "value", DEFAULT_CACHE_TTL);
  });

  test("swallows and logs through the container logger when the write throws", async () => {
    const logger = createMockLogger();
    container.addConstant("logger", logger);

    const cache = createMockCache({ set: mock(() => Promise.reject(new Error("write failed"))) });

    await safeCacheSet(cache, "key", "value");

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect((logger.error.mock.calls as unknown[][])[0]?.[0]).toContain("write failed");

    container.removeConstant("logger");
  });
});
