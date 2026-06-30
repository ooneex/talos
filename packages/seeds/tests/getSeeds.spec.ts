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
});
