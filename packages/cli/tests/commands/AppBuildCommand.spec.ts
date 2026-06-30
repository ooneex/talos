import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { AppBuildCommand } from "@/commands/AppBuildCommand";

describe("AppBuildCommand", () => {
  let command: AppBuildCommand;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;
  let spawnCalls: { cmd: string[]; cwd: string }[];

  beforeEach(() => {
    command = new AppBuildCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `app-build-${Date.now()}`);
    spawnCalls = [];

    originalSpawn = Bun.spawn;
    Bun.spawn = ((...args: unknown[]) => {
      const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;
      const opts = (Array.isArray(args[0]) ? args[1] : args[0]) as { cwd?: string } | undefined;
      if (Array.isArray(cmd)) {
        spawnCalls.push({ cmd: [...(cmd as string[])], cwd: (opts?.cwd as string) ?? "" });
      }
      return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
    }) as typeof Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("app:build");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Build the application");
    });
  });

  describe("run()", () => {
    test("should error when app module does not exist", async () => {
      await Bun.write(join(testDir, ".gitkeep"), "");
      process.chdir(testDir);

      await command.run();

      expect(spawnCalls).toHaveLength(0);
    });

    test("should run bun build with correct arguments", async () => {
      const appDir = join(testDir, "modules", "app");
      await Bun.write(join(appDir, "package.json"), JSON.stringify({ name: "@acme/app" }));
      process.chdir(testDir);

      await command.run();

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0]?.cmd).toEqual(["bun", "build", "./src/index.ts", "--outdir", "./dist", "--target", "bun"]);
      expect(spawnCalls[0]?.cwd).toBe(appDir);
    });

    test("should handle build failure", async () => {
      Bun.spawn = ((...args: unknown[]) => {
        const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;
        const opts = (Array.isArray(args[0]) ? args[1] : args[0]) as { cwd?: string } | undefined;
        if (Array.isArray(cmd)) {
          spawnCalls.push({ cmd: [...(cmd as string[])], cwd: (opts?.cwd as string) ?? "" });
        }
        return { exited: Promise.resolve(1) } as unknown as ReturnType<typeof Bun.spawn>;
      }) as typeof Bun.spawn;

      const appDir = join(testDir, "modules", "app");
      await Bun.write(join(appDir, "package.json"), JSON.stringify({ name: "@acme/app" }));
      process.chdir(testDir);

      await command.run();

      expect(spawnCalls).toHaveLength(1);
    });

    test("should use directory name when package.json has no name", async () => {
      const appDir = join(testDir, "modules", "app");
      await Bun.write(join(appDir, "package.json"), JSON.stringify({}));
      process.chdir(testDir);

      await command.run();

      expect(spawnCalls).toHaveLength(1);
    });
  });
});
