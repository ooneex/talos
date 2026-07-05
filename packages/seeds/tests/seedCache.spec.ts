import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import {
  computeSeedHash,
  deleteSeedCache,
  isSeedCached,
  SEED_CACHE_VERSION,
  seedCacheDir,
  writeSeedCache,
} from "@/seedCache";
import type { ISeed } from "@/types";

const makeSeed = (run: () => unknown): ISeed => ({
  run: run as ISeed["run"],
  isActive: () => true,
  getDependencies: () => [],
  getEnv: () => [],
});

describe("seedCacheDir", () => {
  test("should default to var/cache/seeds under the current working directory", () => {
    expect(seedCacheDir()).toBe(join(process.cwd(), "var", "cache", "seeds"));
  });

  test("should honor an explicit root directory", () => {
    expect(seedCacheDir("/tmp/app")).toBe(join("/tmp/app", "var", "cache", "seeds"));
  });
});

describe("computeSeedHash", () => {
  test("should be stable for the same seed code and environment", () => {
    const seed = makeSeed(() => Promise.resolve());
    const a = computeSeedHash(seed, "staging");
    const b = computeSeedHash(seed, "staging");
    expect(a).toBe(b);
  });

  test("should change when the seed code changes", () => {
    const one = makeSeed(() => Promise.resolve("one"));
    const two = makeSeed(() => Promise.resolve("two"));
    const a = computeSeedHash(one, "staging");
    const b = computeSeedHash(two, "staging");
    expect(a).not.toBe(b);
  });

  test("should change when the target environment changes", () => {
    const seed = makeSeed(() => Promise.resolve());
    const a = computeSeedHash(seed, "staging");
    const b = computeSeedHash(seed, "production");
    expect(a).not.toBe(b);
  });
});

describe("seed cache entries", () => {
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = join(process.cwd(), ".temp", `seed-cache-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
  });

  test("should miss before anything is written", async () => {
    expect(await isSeedCached(cacheDir, "UsersSeed", "abc")).toBe(false);
  });

  test("should hit after a matching write and store the entry shape", async () => {
    await writeSeedCache(cacheDir, "UsersSeed", "abc");

    expect(await isSeedCached(cacheDir, "UsersSeed", "abc")).toBe(true);

    const entry = await Bun.file(join(cacheDir, "UsersSeed.json")).json();
    expect(entry.version).toBe(SEED_CACHE_VERSION);
    expect(entry.name).toBe("UsersSeed");
    expect(entry.hash).toBe("abc");
    expect(typeof entry.ranAt).toBe("string");
  });

  test("should miss when the stored hash differs from the current one", async () => {
    await writeSeedCache(cacheDir, "UsersSeed", "abc");

    expect(await isSeedCached(cacheDir, "UsersSeed", "xyz")).toBe(false);
  });

  test("should miss after the entry is deleted", async () => {
    await writeSeedCache(cacheDir, "UsersSeed", "abc");
    await deleteSeedCache(cacheDir, "UsersSeed");

    expect(await isSeedCached(cacheDir, "UsersSeed", "abc")).toBe(false);
  });

  test("should treat deleting a missing entry as a no-op", async () => {
    expect(deleteSeedCache(cacheDir, "does-not-exist")).resolves.toBeUndefined();
  });

  test("should cache each seed independently (per seed, not per module)", async () => {
    await writeSeedCache(cacheDir, "UsersSeed", "users-hash");
    await writeSeedCache(cacheDir, "PostsSeed", "posts-hash");

    // One JSON file per seed — not one entry for the whole module.
    expect(await Bun.file(join(cacheDir, "UsersSeed.json")).exists()).toBe(true);
    expect(await Bun.file(join(cacheDir, "PostsSeed.json")).exists()).toBe(true);
    expect(await isSeedCached(cacheDir, "UsersSeed", "users-hash")).toBe(true);
    expect(await isSeedCached(cacheDir, "PostsSeed", "posts-hash")).toBe(true);

    // Editing only one seed changes only its fingerprint — the untouched sibling
    // stays a hit, where a per-module cache would have dropped it too.
    expect(await isSeedCached(cacheDir, "UsersSeed", "users-hash-v2")).toBe(false);
    expect(await isSeedCached(cacheDir, "PostsSeed", "posts-hash")).toBe(true);
  });

  test("should sanitize seed names into safe file names", async () => {
    await writeSeedCache(cacheDir, "weird name/with:chars", "abc");

    expect(await isSeedCached(cacheDir, "weird name/with:chars", "abc")).toBe(true);
    expect(await Bun.file(join(cacheDir, "weird-name-with-chars.json")).exists()).toBe(true);
  });
});
