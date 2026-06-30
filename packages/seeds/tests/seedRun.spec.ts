import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { container } from "@talosjs/container";
import { SEEDS_CONTAINER } from "@/container";
import { Environment, type ISeed, type SeedClassType } from "@/types";

// Capture logger instances created by run()
const LOGGER_INSTANCES: Array<{
  info: ReturnType<typeof mock>;
  warn: ReturnType<typeof mock>;
  error: ReturnType<typeof mock>;
  success: ReturnType<typeof mock>;
}> = [];

mock.module("@talosjs/logger", () => {
  class TerminalLogger {
    public info = mock(() => {});
    public warn = mock(() => {});
    public error = mock(() => {});
    public success = mock(() => {});

    constructor() {
      LOGGER_INSTANCES.push(this);
    }
  }

  return { TerminalLogger };
});

// Ensure the module under test sees our logger mock.
const { run } = await import("@/run");

describe("run", () => {
  let originalGet: typeof container.get;
  let originalExit: typeof process.exit;
  let originalAppEnv: string | undefined;

  beforeEach(() => {
    originalGet = container.get;
    originalExit = process.exit;
    originalAppEnv = process.env.APP_ENV;

    SEEDS_CONTAINER.length = 0;
    LOGGER_INSTANCES.length = 0;

    // Replace process.exit so a failing seed doesn't terminate the test runner
    process.exit = mock(() => {
      throw new Error("process.exit called");
    }) as unknown as typeof process.exit;
  });

  afterEach(() => {
    container.get = originalGet;
    process.exit = originalExit;
    if (originalAppEnv === undefined) {
      delete process.env.APP_ENV;
    } else {
      process.env.APP_ENV = originalAppEnv;
    }
    SEEDS_CONTAINER.length = 0;
    LOGGER_INSTANCES.length = 0;
  });

  test("should log and return when there are no seeds", async () => {
    await run();

    expect(LOGGER_INSTANCES).toHaveLength(1);
    const logger = LOGGER_INSTANCES[0];
    expect(logger).toBeDefined();
    if (!logger) throw new Error("expected TerminalLogger instance");
    expect(logger.info).toHaveBeenCalledWith("No seeds found\n", undefined, {
      showTimestamp: false,
      showArrow: false,
      useSymbol: true,
    });
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

    await run();

    expect(closeFn).toHaveBeenCalledTimes(1);

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

    await run();

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

    await run();

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

    expect(run()).rejects.toThrow("process.exit called");

    const logger = LOGGER_INSTANCES[0];
    expect(logger).toBeDefined();
    if (!logger) throw new Error("expected TerminalLogger instance");
    expect(logger.error).toHaveBeenCalledWith(`Seed ${seedInstance.constructor.name} failed\n`, undefined, {
      showTimestamp: false,
      showArrow: false,
      useSymbol: true,
    });
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
