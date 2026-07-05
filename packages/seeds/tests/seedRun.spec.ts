import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { container } from "@talosjs/container";
import { SEEDS_CONTAINER } from "@/container";
import { run } from "@/run";
import { computeSeedHash, isSeedCached, writeSeedCache } from "@/seedCache";
import { Environment, type ISeed, type SeedClassType } from "@/types";

describe("run", () => {
  let originalGet: typeof container.get;
  let originalExit: typeof process.exit;
  let originalAppEnv: string | undefined;
  let cacheDir: string;
  let stdout: string[];
  let stdoutSpy: ReturnType<typeof spyOn>;

  /** Everything written to stdout during the current test, ANSI codes stripped. */
  const output = (): string => stdout.join("").replace(/\x1b\[[0-9;]*m/g, "");

  beforeEach(() => {
    originalGet = container.get;
    originalExit = process.exit;
    originalAppEnv = process.env.APP_ENV;

    SEEDS_CONTAINER.length = 0;
    cacheDir = join(process.cwd(), ".temp", `seed-run-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    stdout = [];
    stdoutSpy = spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array): boolean => {
      stdout.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
      return true;
    });

    // Replace process.exit so a failing seed doesn't terminate the test runner
    process.exit = mock(() => {
      throw new Error("process.exit called");
    }) as unknown as typeof process.exit;
  });

  afterEach(() => {
    container.get = originalGet;
    process.exit = originalExit;
    stdoutSpy.mockRestore();
    if (originalAppEnv === undefined) {
      delete process.env.APP_ENV;
    } else {
      process.env.APP_ENV = originalAppEnv;
    }
    SEEDS_CONTAINER.length = 0;
    rmSync(cacheDir, { recursive: true, force: true });
  });

  test("should log and return when there are no seeds", async () => {
    await run({ cacheDir });

    expect(output()).toContain("No seeds found");
  });

  test("should close the database after all seeds complete", async () => {
    class CloseSeed implements ISeed {
      run<T = unknown>(_data?: unknown[]): T | Promise<T> {
        return Promise.resolve(undefined as unknown as T);
      }
      isActive() {
        return true;
      }
      getDependencies() {
        return [];
      }
      getEnv() {
        return [];
      }
    }

    const seedInstance = new CloseSeed();
    SEEDS_CONTAINER.push(CloseSeed as unknown as SeedClassType);

    container.get = mock(() => seedInstance) as unknown as typeof container.get;

    const closeFn = mock(() => Promise.resolve());
    const originalGetConstant = container.getConstant;
    container.getConstant = mock((id: string | symbol) => {
      if (id === "database") return { close: closeFn };
      return originalGetConstant.call(container, id);
    }) as typeof container.getConstant;

    await run({ cacheDir });

    expect(closeFn).toHaveBeenCalledTimes(1);
    expect(output()).toContain("CloseSeed");

    container.getConstant = originalGetConstant;
  });

  test("should run dependencies before running the seed", async () => {
    const calls: string[] = [];

    class DependencySeed implements ISeed {
      run<T = unknown>(_data?: unknown[]): T | Promise<T> {
        calls.push("dependency.run");
        return "dep-result" as unknown as T;
      }
      isActive() {
        return true;
      }
      getDependencies() {
        return [];
      }
      getEnv() {
        return [];
      }
    }

    class MainSeed implements ISeed {
      run<T = unknown>(_data?: unknown[]): T | Promise<T> {
        calls.push("main.run");
        return Promise.resolve(undefined as unknown as T);
      }
      isActive() {
        return true;
      }
      getDependencies() {
        return [DependencySeed as unknown as SeedClassType];
      }
      getEnv() {
        return [];
      }
    }

    const dep = new DependencySeed();
    const main = new MainSeed();

    SEEDS_CONTAINER.push(MainSeed as unknown as SeedClassType);

    container.get = mock((klass: SeedClassType) => {
      if (klass === (DependencySeed as unknown as SeedClassType)) return dep;
      if (klass === (MainSeed as unknown as SeedClassType)) return main;
      throw new Error("unexpected seed class");
    }) as unknown as typeof container.get;

    await run({ cacheDir });

    expect(calls).toEqual(["dependency.run", "main.run"]);
  });

  test("should run seed when current environment is in getEnv list", async () => {
    process.env.APP_ENV = "staging";

    const calls: string[] = [];

    class StagingSeed implements ISeed {
      run<T = unknown>(_data?: unknown[]): T | Promise<T> {
        calls.push("staging.run");
        return Promise.resolve(undefined as unknown as T);
      }
      isActive() {
        return true;
      }
      getDependencies() {
        return [];
      }
      getEnv(): Environment[] {
        return [Environment.STAGING, Environment.PRODUCTION];
      }
    }

    const seedInstance = new StagingSeed();
    SEEDS_CONTAINER.push(StagingSeed as unknown as SeedClassType);

    container.get = mock(() => seedInstance) as unknown as typeof container.get;

    await run({ cacheDir });

    expect(calls).toEqual(["staging.run"]);
  });

  test("should log error and call process.exit(1) on failure", async () => {
    class FailingSeed implements ISeed {
      run<T = unknown>(_data?: unknown[]): T | Promise<T> {
        throw new Error("boom");
      }
      isActive() {
        return true;
      }
      getDependencies() {
        return [];
      }
      getEnv() {
        return [];
      }
    }

    const seedInstance = new FailingSeed();
    SEEDS_CONTAINER.push(FailingSeed as unknown as SeedClassType);

    container.get = mock(() => seedInstance) as unknown as typeof container.get;

    expect(run({ cacheDir })).rejects.toThrow("process.exit called");

    expect(output()).toContain("FailingSeed");
    expect(output()).toContain("failed");
    expect(output()).toContain("boom");
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  test("should write a cache entry after a successful run", async () => {
    class CachedSeed implements ISeed {
      run<T = unknown>(_data?: unknown[]): T | Promise<T> {
        return Promise.resolve(undefined as unknown as T);
      }
      isActive() {
        return true;
      }
      getDependencies() {
        return [];
      }
      getEnv() {
        return [];
      }
    }

    const seedInstance = new CachedSeed();
    SEEDS_CONTAINER.push(CachedSeed as unknown as SeedClassType);
    container.get = mock(() => seedInstance) as unknown as typeof container.get;

    await run({ cacheDir });

    const hash = computeSeedHash(seedInstance, process.env.APP_ENV);
    expect(await isSeedCached(cacheDir, "CachedSeed", hash)).toBe(true);
  });

  test("should skip a seed whose cache entry is still valid", async () => {
    const calls: string[] = [];

    class UnchangedSeed implements ISeed {
      run<T = unknown>(_data?: unknown[]): T | Promise<T> {
        calls.push("run");
        return Promise.resolve(undefined as unknown as T);
      }
      isActive() {
        return true;
      }
      getDependencies() {
        return [];
      }
      getEnv() {
        return [];
      }
    }

    const seedInstance = new UnchangedSeed();
    SEEDS_CONTAINER.push(UnchangedSeed as unknown as SeedClassType);
    container.get = mock(() => seedInstance) as unknown as typeof container.get;

    // Pre-seed a matching cache entry so the seed is considered up to date.
    const hash = computeSeedHash(seedInstance, process.env.APP_ENV);
    await writeSeedCache(cacheDir, "UnchangedSeed", hash);

    await run({ cacheDir });

    expect(calls).toEqual([]);
    expect(output()).toContain("cached");
  });

  test("should re-run a seed when its cached hash no longer matches", async () => {
    const calls: string[] = [];

    class ChangedSeed implements ISeed {
      run<T = unknown>(_data?: unknown[]): T | Promise<T> {
        calls.push("run");
        return Promise.resolve(undefined as unknown as T);
      }
      isActive() {
        return true;
      }
      getDependencies() {
        return [];
      }
      getEnv() {
        return [];
      }
    }

    const seedInstance = new ChangedSeed();
    SEEDS_CONTAINER.push(ChangedSeed as unknown as SeedClassType);
    container.get = mock(() => seedInstance) as unknown as typeof container.get;

    // A stale entry (different code) must not cause the seed to be skipped.
    await writeSeedCache(cacheDir, "ChangedSeed", "stale-hash");

    await run({ cacheDir });

    expect(calls).toEqual(["run"]);
  });
});
