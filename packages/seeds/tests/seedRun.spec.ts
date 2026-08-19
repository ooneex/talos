import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { container } from "@talosjs/container";
import { SEEDS_CONTAINER } from "@/container";
import { run } from "@/run";
import { Environment, type ISeed, type SeedClassType } from "@/types";

describe("run", () => {
  let originalGet: typeof container.get;
  let originalExit: typeof process.exit;
  let originalAppEnv: string | undefined;
  let originalArgv: string[];
  let stdout: string[];
  let stdoutSpy: ReturnType<typeof spyOn>;

  /** Everything written to stdout during the current test, ANSI codes stripped. */
  const output = (): string => stdout.join("").replace(/\x1b\[[0-9;]*m/g, "");

  beforeEach(() => {
    originalGet = container.get;
    originalExit = process.exit;
    originalAppEnv = process.env.APP_ENV;
    originalArgv = [...Bun.argv];

    SEEDS_CONTAINER.length = 0;

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
    (Bun as { argv: string[] }).argv = originalArgv;
    SEEDS_CONTAINER.length = 0;
  });

  test("should log and return when there are no seeds", async () => {
    await run();

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

    await run();

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

    // Declared last on purpose: the dependency has to be pulled ahead of the
    // seed that declares it, whatever the registration order.
    SEEDS_CONTAINER.push(MainSeed as unknown as SeedClassType, DependencySeed as unknown as SeedClassType);

    container.get = mock((klass: SeedClassType) => {
      if (klass === (DependencySeed as unknown as SeedClassType)) return dep;
      if (klass === (MainSeed as unknown as SeedClassType)) return main;
      throw new Error("unexpected seed class");
    }) as unknown as typeof container.get;

    await run();

    expect(calls).toEqual(["dependency.run", "main.run"]);
  });

  test("should run a dependency once instead of again on its own turn", async () => {
    const calls: string[] = [];

    class SharedSeed implements ISeed {
      run<T = unknown>(_data?: unknown[]): T | Promise<T> {
        calls.push("shared.run");
        return "shared-result" as unknown as T;
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

    class FirstSeed implements ISeed {
      run<T = unknown>(data?: unknown[]): T | Promise<T> {
        calls.push(`first.run:${JSON.stringify(data)}`);
        return Promise.resolve(undefined as unknown as T);
      }
      isActive() {
        return true;
      }
      getDependencies() {
        return [SharedSeed as unknown as SeedClassType];
      }
      getEnv() {
        return [];
      }
    }

    class SecondSeed implements ISeed {
      run<T = unknown>(data?: unknown[]): T | Promise<T> {
        calls.push(`second.run:${JSON.stringify(data)}`);
        return Promise.resolve(undefined as unknown as T);
      }
      isActive() {
        return true;
      }
      getDependencies() {
        return [SharedSeed as unknown as SeedClassType];
      }
      getEnv() {
        return [];
      }
    }

    const shared = new SharedSeed();
    const first = new FirstSeed();
    const second = new SecondSeed();

    SEEDS_CONTAINER.push(
      FirstSeed as unknown as SeedClassType,
      SharedSeed as unknown as SeedClassType,
      SecondSeed as unknown as SeedClassType,
    );

    container.get = mock((klass: SeedClassType) => {
      if (klass === (SharedSeed as unknown as SeedClassType)) return shared;
      if (klass === (FirstSeed as unknown as SeedClassType)) return first;
      if (klass === (SecondSeed as unknown as SeedClassType)) return second;
      throw new Error("unexpected seed class");
    }) as unknown as typeof container.get;

    await run();

    // The shared dependency runs exactly once, ahead of both seeds that declare
    // it, and each of them receives the result it already produced.
    expect(calls).toEqual(["shared.run", 'first.run:["shared-result"]', 'second.run:["shared-result"]']);
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

    expect(output()).toContain("FailingSeed");
    expect(output()).toContain("failed");
    expect(output()).toContain("boom");
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  test("should drop the database when the drop flag is provided", async () => {
    class DropSeed implements ISeed {
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

    const seedInstance = new DropSeed();
    const dropFn = mock(() => Promise.resolve());
    const closeFn = mock(() => Promise.resolve());
    const originalGetConstant = container.getConstant;

    (Bun as { argv: string[] }).argv = ["bun", "run", "--drop"];
    SEEDS_CONTAINER.push(DropSeed as unknown as SeedClassType);
    container.get = mock(() => seedInstance) as unknown as typeof container.get;
    container.getConstant = mock((id: string | symbol) => {
      if (id === "database") return { drop: dropFn, close: closeFn };
      return originalGetConstant.call(container, id);
    }) as typeof container.getConstant;

    await run();

    expect(dropFn).toHaveBeenCalledTimes(1);
    expect(output()).toContain("Database dropped");

    container.getConstant = originalGetConstant;
  });
});
