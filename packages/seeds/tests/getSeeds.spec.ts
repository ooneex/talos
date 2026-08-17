import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { container } from "@talosjs/container";
import { SEEDS_CONTAINER } from "@/container";
import { getSeeds } from "@/getSeeds";
import { Environment, type ISeed, type SeedClassType } from "@/types";

describe("getSeeds", () => {
  let originalGet: typeof container.get;
  let originalAppEnv: string | undefined;

  beforeEach(() => {
    originalGet = container.get;
    originalAppEnv = process.env.APP_ENV;
    SEEDS_CONTAINER.length = 0;
  });

  afterEach(() => {
    container.get = originalGet;
    if (originalAppEnv === undefined) {
      delete process.env.APP_ENV;
    } else {
      process.env.APP_ENV = originalAppEnv;
    }
    SEEDS_CONTAINER.length = 0;
  });

  test("should resolve instances from container and return only active seeds", async () => {
    class ActiveSeed implements ISeed {
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

    class InactiveSeed implements ISeed {
      run<T = unknown>(_data?: unknown[]): T | Promise<T> {
        return Promise.resolve(undefined as unknown as T);
      }
      isActive() {
        return false;
      }
      getDependencies() {
        return [];
      }
      getEnv() {
        return [];
      }
    }

    const active = new ActiveSeed();
    const inactive = new InactiveSeed();

    SEEDS_CONTAINER.push(ActiveSeed as unknown as SeedClassType, InactiveSeed as unknown as SeedClassType);

    container.get = mock((klass: SeedClassType) => {
      if (klass === (ActiveSeed as unknown as SeedClassType)) return active;
      if (klass === (InactiveSeed as unknown as SeedClassType)) return inactive;
      throw new Error("unexpected seed class");
    }) as unknown as typeof container.get;

    const seeds = await getSeeds();

    expect(container.get).toHaveBeenCalledTimes(2);
    expect(seeds).toEqual([active]);
  });

  test("should exclude seed not allowed in current environment", async () => {
    process.env.APP_ENV = Environment.PRODUCTION;

    class LocalOnlySeed implements ISeed {
      run<T = unknown>(_data?: unknown[]): T | Promise<T> {
        return Promise.resolve(undefined as unknown as T);
      }
      isActive() {
        return true;
      }
      getDependencies() {
        return [];
      }
      getEnv(): Environment[] {
        return [Environment.LOCAL, Environment.DEVELOPMENT];
      }
    }

    const seed = new LocalOnlySeed();
    SEEDS_CONTAINER.push(LocalOnlySeed as unknown as SeedClassType);
    container.get = mock(() => seed) as unknown as typeof container.get;

    const seeds = await getSeeds();

    expect(seeds).toEqual([]);
  });

  test("should include seed when current environment is in getEnv list", async () => {
    process.env.APP_ENV = Environment.STAGING;

    class StagingSeed implements ISeed {
      run<T = unknown>(_data?: unknown[]): T | Promise<T> {
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

    const seed = new StagingSeed();
    SEEDS_CONTAINER.push(StagingSeed as unknown as SeedClassType);
    container.get = mock(() => seed) as unknown as typeof container.get;

    const seeds = await getSeeds();

    expect(seeds).toEqual([seed]);
  });

  test("should include seed with empty getEnv in any environment", async () => {
    process.env.APP_ENV = Environment.PRODUCTION;

    class UniversalSeed implements ISeed {
      run<T = unknown>(_data?: unknown[]): T | Promise<T> {
        return Promise.resolve(undefined as unknown as T);
      }
      isActive() {
        return true;
      }
      getDependencies() {
        return [];
      }
      getEnv(): Environment[] {
        return [];
      }
    }

    const seed = new UniversalSeed();
    SEEDS_CONTAINER.push(UniversalSeed as unknown as SeedClassType);
    container.get = mock(() => seed) as unknown as typeof container.get;

    const seeds = await getSeeds();

    expect(seeds).toEqual([seed]);
  });

  test("should place a seed after the dependencies it declares, listing each once", async () => {
    class BaseSeed implements ISeed {
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

    class LeftSeed implements ISeed {
      run<T = unknown>(_data?: unknown[]): T | Promise<T> {
        return Promise.resolve(undefined as unknown as T);
      }
      isActive() {
        return true;
      }
      getDependencies() {
        return [BaseSeed as unknown as SeedClassType];
      }
      getEnv() {
        return [];
      }
    }

    class RightSeed implements ISeed {
      run<T = unknown>(_data?: unknown[]): T | Promise<T> {
        return Promise.resolve(undefined as unknown as T);
      }
      isActive() {
        return true;
      }
      getDependencies() {
        return [BaseSeed as unknown as SeedClassType, LeftSeed as unknown as SeedClassType];
      }
      getEnv() {
        return [];
      }
    }

    const base = new BaseSeed();
    const left = new LeftSeed();
    const right = new RightSeed();

    SEEDS_CONTAINER.push(
      RightSeed as unknown as SeedClassType,
      LeftSeed as unknown as SeedClassType,
      BaseSeed as unknown as SeedClassType,
    );

    container.get = mock((klass: SeedClassType) => {
      if (klass === (BaseSeed as unknown as SeedClassType)) return base;
      if (klass === (LeftSeed as unknown as SeedClassType)) return left;
      if (klass === (RightSeed as unknown as SeedClassType)) return right;
      throw new Error("unexpected seed class");
    }) as unknown as typeof container.get;

    const seeds = await getSeeds();

    expect(seeds).toEqual([base, left, right]);
  });

  test("should skip a dependency that is inactive", async () => {
    class InactiveDependencySeed implements ISeed {
      run<T = unknown>(_data?: unknown[]): T | Promise<T> {
        return Promise.resolve(undefined as unknown as T);
      }
      isActive() {
        return false;
      }
      getDependencies() {
        return [];
      }
      getEnv() {
        return [];
      }
    }

    class DependentSeed implements ISeed {
      run<T = unknown>(_data?: unknown[]): T | Promise<T> {
        return Promise.resolve(undefined as unknown as T);
      }
      isActive() {
        return true;
      }
      getDependencies() {
        return [InactiveDependencySeed as unknown as SeedClassType];
      }
      getEnv() {
        return [];
      }
    }

    const inactive = new InactiveDependencySeed();
    const dependent = new DependentSeed();

    SEEDS_CONTAINER.push(DependentSeed as unknown as SeedClassType, InactiveDependencySeed as unknown as SeedClassType);

    container.get = mock((klass: SeedClassType) => {
      if (klass === (InactiveDependencySeed as unknown as SeedClassType)) return inactive;
      if (klass === (DependentSeed as unknown as SeedClassType)) return dependent;
      throw new Error("unexpected seed class");
    }) as unknown as typeof container.get;

    const seeds = await getSeeds();

    expect(seeds).toEqual([dependent]);
  });

  test("should not loop forever on a dependency cycle", async () => {
    class ASeed implements ISeed {
      run<T = unknown>(_data?: unknown[]): T | Promise<T> {
        return Promise.resolve(undefined as unknown as T);
      }
      isActive() {
        return true;
      }
      getDependencies(): SeedClassType[] {
        return [BSeed as unknown as SeedClassType];
      }
      getEnv() {
        return [];
      }
    }

    class BSeed implements ISeed {
      run<T = unknown>(_data?: unknown[]): T | Promise<T> {
        return Promise.resolve(undefined as unknown as T);
      }
      isActive() {
        return true;
      }
      getDependencies(): SeedClassType[] {
        return [ASeed as unknown as SeedClassType];
      }
      getEnv() {
        return [];
      }
    }

    const a = new ASeed();
    const b = new BSeed();

    SEEDS_CONTAINER.push(ASeed as unknown as SeedClassType, BSeed as unknown as SeedClassType);

    container.get = mock((klass: SeedClassType) => {
      if (klass === (ASeed as unknown as SeedClassType)) return a;
      if (klass === (BSeed as unknown as SeedClassType)) return b;
      throw new Error("unexpected seed class");
    }) as unknown as typeof container.get;

    const seeds = await getSeeds();

    expect(seeds).toHaveLength(2);
    expect(new Set(seeds)).toEqual(new Set([a, b]));
  });
});
