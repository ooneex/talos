import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";

// Mock enquirer before importing
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

const { ensureModule, extractYamlComments, getCliVersion, runModuleScripts, toYaml } = await import("@/utils");
const { ModuleCreateCommand } = await import("@/commands/ModuleCreateCommand");
const { TerminalLogger } = await import("@talosjs/logger");

describe("getCliVersion", () => {
  test("should resolve the version from the CLI package.json", async () => {
    const packageVersion = (await Bun.file(join(import.meta.dir, "../package.json")).json()).version as string;
    expect(await getCliVersion()).toBe(packageVersion);
  });
});

describe("toYaml", () => {
  test("should serialize a flat object to block-style YAML", () => {
    const result = toYaml({ name: "talos", port: 3000 });
    expect(result).toBe("name: talos\nport: 3000");
  });

  test("should serialize nested objects with indentation", () => {
    const result = toYaml({ app: { env: "local", port: 3000 } });
    expect(result).toBe("app:\n  env: local\n  port: 3000");
  });

  test('should quote empty strings as ""', () => {
    const result = toYaml({ host: "", port: 3000 });
    expect(result).toContain('host: ""');
  });

  test("should serialize arrays as block list under key", () => {
    const result = toYaml({ inherits: ["ROLE_GUEST"] });
    expect(result).toBe("inherits:\n  - ROLE_GUEST");
  });

  test("should serialize empty arrays as []", () => {
    const result = toYaml({ tags: [] });
    expect(result).toBe("tags: []");
  });

  test("should serialize booleans and numbers without quotes", () => {
    const result = toYaml({ active: true, count: 42 });
    expect(result).toBe("active: true\ncount: 42");
  });

  test('should serialize null/undefined values as ""', () => {
    expect(toYaml(null)).toBe('""');
    expect(toYaml(undefined)).toBe('""');
    const result = toYaml({ key: null });
    expect(result).toBe('key: ""');
  });

  test("should not quote plain string values like URLs", () => {
    const result = toYaml({ url: "redis://localhost:6379" });
    expect(result).toBe("url: redis://localhost:6379");
  });

  test("should deeply nest objects", () => {
    const result = toYaml({ a: { b: { c: "val" } } });
    expect(result).toBe("a:\n  b:\n    c: val");
  });

  test("should emit comments above keys when a comment map is provided", () => {
    const comments = extractYamlComments("# Section\napp:\n  # APP_ENV\n  env: local\n");
    const result = toYaml({ app: { env: "local" } }, 0, comments);
    expect(result).toBe("# Section\napp:\n  # APP_ENV\n  env: local");
  });

  test("should separate top-level sections with a blank line when commented", () => {
    const comments = extractYamlComments("# A\na:\n  x: 1\n# B\nb:\n  y: 2\n");
    const result = toYaml({ a: { x: 1 }, b: { y: 2 } }, 0, comments);
    expect(result).toBe("# A\na:\n  x: 1\n\n# B\nb:\n  y: 2");
  });

  test("should leave output unchanged when no comment map is provided", () => {
    const result = toYaml({ a: { x: 1 }, b: { y: 2 } });
    expect(result).toBe("a:\n  x: 1\nb:\n  y: 2");
  });
});

describe("extractYamlComments", () => {
  test("should map nested key paths to their preceding comments", () => {
    const comments = extractYamlComments("cache:\n  redis:\n    # CACHE_REDIS_URL\n    url: x\n");
    expect(comments.get("cache.redis.url")).toEqual(["# CACHE_REDIS_URL"]);
  });

  test("should capture multiple comment lines preceding a key", () => {
    const comments = extractYamlComments("# first\n# second\nkey: value\n");
    expect(comments.get("key")).toEqual(["# first", "# second"]);
  });

  test("should reset pending comments on a blank line", () => {
    const comments = extractYamlComments("# orphan\n\nkey: value\n");
    expect(comments.has("key")).toBe(false);
  });
});

describe("runModuleScripts", () => {
  let logger: InstanceType<typeof TerminalLogger>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;
  let originalExit: typeof process.exit;
  let exitCalls: number[];
  let spawnCalls: { cmd: string[]; cwd: string; stderr?: string; env?: NodeJS.ProcessEnv }[];

  const SEEDS = { binPath: ["bin", "seed", "run.ts"], label: "seeds" };
  const MIGRATIONS = { binPath: ["bin", "migration", "up.ts"], label: "migrations" };

  const mockSpawn = (exitCode = 0, stderr = "") => {
    Bun.spawn = ((...args: unknown[]) => {
      const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;
      const opts = (Array.isArray(args[0]) ? args[1] : args[0]) as
        | { cwd?: string; env?: NodeJS.ProcessEnv }
        | undefined;
      if (Array.isArray(cmd)) {
        const stderrOpt = (opts as { stderr?: string })?.stderr;
        const call: { cmd: string[]; cwd: string; stderr?: string; env?: NodeJS.ProcessEnv } = {
          cmd: [...(cmd as string[])],
          cwd: (opts?.cwd as string) ?? "",
          ...(stderrOpt !== undefined && { stderr: stderrOpt }),
        };
        if (opts?.env !== undefined) call.env = opts.env;
        spawnCalls.push(call);
      }
      return {
        stderr: new Response(stderr).body,
        exited: Promise.resolve(exitCode),
      } as unknown as ReturnType<typeof Bun.spawn>;
    }) as typeof Bun.spawn;
  };

  beforeEach(() => {
    logger = new TerminalLogger();
    for (const method of ["info", "warn", "success", "error"] as const) {
      spyOn(logger, method).mockImplementation(() => {});
    }
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `run-module-scripts-${Date.now()}`);
    spawnCalls = [];
    originalSpawn = Bun.spawn;
    mockSpawn(0);
    exitCalls = [];
    originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCalls.push(code ?? 0);
    }) as typeof process.exit;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
    process.exit = originalExit;
    process.chdir(originalCwd);
    rmSync(testDir, { recursive: true, force: true });
  });

  test("should warn and not spawn when the modules directory is missing", async () => {
    await Bun.write(join(testDir, ".gitkeep"), "");
    process.chdir(testDir);

    await runModuleScripts(logger, SEEDS);

    expect(spawnCalls).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith("No modules with seeds found", undefined, expect.anything());
  });

  test("should warn and not spawn when no module has the script", async () => {
    const moduleDir = join(testDir, "modules", "auth");
    await Bun.write(join(moduleDir, "package.json"), JSON.stringify({ name: "@acme/auth" }));
    process.chdir(testDir);

    await runModuleScripts(logger, SEEDS);

    expect(spawnCalls).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith("No modules with seeds found", undefined, expect.anything());
  });

  test("should run the script for a module that has it", async () => {
    const moduleDir = join(testDir, "modules", "auth");
    await Bun.write(join(moduleDir, "package.json"), JSON.stringify({ name: "@acme/auth" }));
    await Bun.write(join(moduleDir, "bin", "seed", "run.ts"), "// seed");
    process.chdir(testDir);

    await runModuleScripts(logger, SEEDS);

    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]?.cmd).toEqual(["bun", "run", join(moduleDir, "bin", "seed", "run.ts")]);
    expect(spawnCalls[0]?.cwd).toBe(moduleDir);
    expect(spawnCalls[0]?.stderr).toBe("pipe");
  });

  test("should resolve the bin path from the provided binPath segments", async () => {
    const moduleDir = join(testDir, "modules", "auth");
    await Bun.write(join(moduleDir, "package.json"), JSON.stringify({ name: "@acme/auth" }));
    await Bun.write(join(moduleDir, "bin", "migration", "up.ts"), "// migration");
    process.chdir(testDir);

    await runModuleScripts(logger, MIGRATIONS);

    expect(spawnCalls[0]?.cmd).toEqual(["bun", "run", join(moduleDir, "bin", "migration", "up.ts")]);
  });

  test("should run the script for multiple modules", async () => {
    const authDir = join(testDir, "modules", "auth");
    await Bun.write(join(authDir, "package.json"), JSON.stringify({ name: "@acme/auth" }));
    await Bun.write(join(authDir, "bin", "seed", "run.ts"), "// seed");

    const billingDir = join(testDir, "modules", "billing");
    await Bun.write(join(billingDir, "package.json"), JSON.stringify({ name: "@acme/billing" }));
    await Bun.write(join(billingDir, "bin", "seed", "run.ts"), "// seed");
    process.chdir(testDir);

    await runModuleScripts(logger, SEEDS);

    expect(spawnCalls).toHaveLength(2);
  });

  test("should skip modules without the script", async () => {
    const authDir = join(testDir, "modules", "auth");
    await Bun.write(join(authDir, "package.json"), JSON.stringify({ name: "@acme/auth" }));
    await Bun.write(join(authDir, "bin", "seed", "run.ts"), "// seed");

    const billingDir = join(testDir, "modules", "billing");
    await Bun.write(join(billingDir, "package.json"), JSON.stringify({ name: "@acme/billing" }));
    process.chdir(testDir);

    await runModuleScripts(logger, SEEDS);

    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]?.cwd).toBe(authDir);
  });

  test("should fall back to the directory name when package.json has no name", async () => {
    const moduleDir = join(testDir, "modules", "auth");
    await Bun.write(join(moduleDir, "package.json"), JSON.stringify({}));
    await Bun.write(join(moduleDir, "bin", "seed", "run.ts"), "// seed");
    process.chdir(testDir);

    await runModuleScripts(logger, SEEDS);

    expect(spawnCalls).toHaveLength(1);
    expect(logger.success).toHaveBeenCalledWith("Seeds completed for auth", undefined, expect.anything());
  });

  test("should pass the --drop flag when drop is true", async () => {
    const moduleDir = join(testDir, "modules", "auth");
    await Bun.write(join(moduleDir, "package.json"), JSON.stringify({ name: "@acme/auth" }));
    await Bun.write(join(moduleDir, "bin", "seed", "run.ts"), "// seed");
    process.chdir(testDir);

    await runModuleScripts(logger, { ...SEEDS, drop: true });

    expect(spawnCalls[0]?.cmd).toEqual(["bun", "run", join(moduleDir, "bin", "seed", "run.ts"), "--drop"]);
  });

  test("should not pass the --drop flag when drop is false", async () => {
    const moduleDir = join(testDir, "modules", "auth");
    await Bun.write(join(moduleDir, "package.json"), JSON.stringify({ name: "@acme/auth" }));
    await Bun.write(join(moduleDir, "bin", "seed", "run.ts"), "// seed");
    process.chdir(testDir);

    await runModuleScripts(logger, { ...SEEDS, drop: false });

    expect(spawnCalls[0]?.cmd).toEqual(["bun", "run", join(moduleDir, "bin", "seed", "run.ts")]);
  });

  test("should pass the --version flag when version is provided", async () => {
    const moduleDir = join(testDir, "modules", "auth");
    await Bun.write(join(moduleDir, "package.json"), JSON.stringify({ name: "@acme/auth" }));
    await Bun.write(join(moduleDir, "bin", "migration", "down.ts"), "// down");
    process.chdir(testDir);

    await runModuleScripts(logger, {
      binPath: ["bin", "migration", "down.ts"],
      label: "migrations",
      version: "20240101120000",
    });

    expect(spawnCalls[0]?.cmd).toEqual([
      "bun",
      "run",
      join(moduleDir, "bin", "migration", "down.ts"),
      "--version",
      "20240101120000",
    ]);
  });

  test("should not pass the --version flag when version is omitted", async () => {
    const moduleDir = join(testDir, "modules", "auth");
    await Bun.write(join(moduleDir, "package.json"), JSON.stringify({ name: "@acme/auth" }));
    await Bun.write(join(moduleDir, "bin", "migration", "down.ts"), "// down");
    process.chdir(testDir);

    await runModuleScripts(logger, { binPath: ["bin", "migration", "down.ts"], label: "migrations" });

    expect(spawnCalls[0]?.cmd).toEqual(["bun", "run", join(moduleDir, "bin", "migration", "down.ts")]);
  });

  test("should set APP_ENV in the subprocess environment when env is provided", async () => {
    const moduleDir = join(testDir, "modules", "auth");
    await Bun.write(join(moduleDir, "package.json"), JSON.stringify({ name: "@acme/auth" }));
    await Bun.write(join(moduleDir, "bin", "seed", "run.ts"), "// seed");
    process.chdir(testDir);

    await runModuleScripts(logger, { ...SEEDS, env: "production" });

    expect(spawnCalls[0]?.env?.APP_ENV).toBe("production");
  });

  test("should not override the environment when env is not provided", async () => {
    const moduleDir = join(testDir, "modules", "auth");
    await Bun.write(join(moduleDir, "package.json"), JSON.stringify({ name: "@acme/auth" }));
    await Bun.write(join(moduleDir, "bin", "seed", "run.ts"), "// seed");
    process.chdir(testDir);

    await runModuleScripts(logger, SEEDS);

    // With no env override, spawnStep omits the env option and lets Bun inherit process.env.
    expect(spawnCalls[0]?.env).toBeUndefined();
  });

  test("should log a capitalized success message using the label", async () => {
    const moduleDir = join(testDir, "modules", "auth");
    await Bun.write(join(moduleDir, "package.json"), JSON.stringify({ name: "@acme/auth" }));
    await Bun.write(join(moduleDir, "bin", "seed", "run.ts"), "// seed");
    process.chdir(testDir);

    await runModuleScripts(logger, SEEDS);

    expect(logger.success).toHaveBeenCalledWith("Seeds completed for @acme/auth", undefined, expect.anything());
  });

  test("should log the error message and exit when spawning fails", async () => {
    Bun.spawn = (() => {
      throw new Error("Database connection failed");
    }) as typeof Bun.spawn;

    const moduleDir = join(testDir, "modules", "auth");
    await Bun.write(join(moduleDir, "package.json"), JSON.stringify({ name: "@acme/auth" }));
    await Bun.write(join(moduleDir, "bin", "seed", "run.ts"), "// seed");
    process.chdir(testDir);

    await runModuleScripts(logger, SEEDS);

    expect(logger.error).toHaveBeenCalledWith(
      "Seeds failed for @acme/auth (exit code: 1)",
      { message: "Database connection failed" },
      expect.anything(),
    );
    expect(exitCalls).toEqual([1]);
  });

  test("should stringify a non-Error throw when spawning fails", async () => {
    Bun.spawn = (() => {
      throw "boom";
    }) as typeof Bun.spawn;

    const moduleDir = join(testDir, "modules", "auth");
    await Bun.write(join(moduleDir, "package.json"), JSON.stringify({ name: "@acme/auth" }));
    await Bun.write(join(moduleDir, "bin", "seed", "run.ts"), "// seed");
    process.chdir(testDir);

    await runModuleScripts(logger, SEEDS);

    expect(logger.error).toHaveBeenCalledWith(
      "Seeds failed for @acme/auth (exit code: 1)",
      { message: "boom" },
      expect.anything(),
    );
    expect(exitCalls).toEqual([1]);
  });
});

describe("ensureModule", () => {
  let testDir: string;
  let originalCwd: string;
  let runSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `utils-${Date.now()}`);
    runSpy = spyOn(ModuleCreateCommand.prototype, "run").mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    runSpy.mockRestore();
    rmSync(testDir, { recursive: true, force: true });
  });

  test("should call ModuleCreateCommand.run when module does not exist", async () => {
    await Bun.write(join(testDir, ".gitkeep"), "");
    process.chdir(testDir);

    await ensureModule("blog");

    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(runSpy).toHaveBeenCalledWith({
      name: "blog",
      cwd: testDir,
      silent: true,
    });
  });

  test("should not call ModuleCreateCommand.run when module already exists", async () => {
    await Bun.write(join(testDir, "modules", "blog", "package.json"), "{}");
    process.chdir(testDir);

    await ensureModule("blog");

    expect(runSpy).not.toHaveBeenCalled();
  });

  test("should check the correct module path", async () => {
    await Bun.write(join(testDir, "modules", "auth", "package.json"), "{}");
    process.chdir(testDir);

    // "auth" exists, should not run
    await ensureModule("auth");
    expect(runSpy).not.toHaveBeenCalled();

    // "blog" does not exist, should run
    await ensureModule("blog");
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(runSpy).toHaveBeenCalledWith({
      name: "blog",
      cwd: testDir,
      silent: true,
    });
  });
});
