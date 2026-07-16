import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { AppStopCommand } from "@/commands/AppStopCommand";

describe("AppStopCommand", () => {
  let command: AppStopCommand;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;
  let originalWhich: typeof Bun.which;
  let spawnCalls: { cmd: string[]; cwd: string }[];

  beforeEach(() => {
    command = new AppStopCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `app-stop-${Date.now()}`);
    spawnCalls = [];

    // Pretend `docker` is installed so tests never depend on the host PATH; the
    // missing-binary case is exercised explicitly below.
    originalWhich = Bun.which;
    Bun.which = (() => "/usr/bin/docker") as typeof Bun.which;

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
    Bun.which = originalWhich;
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  const writeModule = async (name: string, type: string, withCompose: boolean): Promise<string> => {
    const moduleDir = join(testDir, "modules", name);
    await Bun.write(join(moduleDir, "package.json"), JSON.stringify({ name: `@acme/${name}` }));
    await Bun.write(join(moduleDir, `${name}.yml`), `type: "${type}"\n`);
    if (withCompose) {
      await Bun.write(join(moduleDir, "docker-compose.yml"), "version: '3'");
    }
    return moduleDir;
  };

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("app:stop");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Stop the application");
    });
  });

  describe("run()", () => {
    test("should error when app module does not exist", async () => {
      await Bun.write(join(testDir, ".gitkeep"), "");
      process.chdir(testDir);

      await command.run();

      expect(spawnCalls).toHaveLength(0);
    });

    test("should run docker compose down", async () => {
      const appDir = await writeModule("app", "api", true);
      process.chdir(testDir);

      await command.run();

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0]?.cmd).toEqual(["docker", "compose", "down"]);
      expect(spawnCalls[0]?.cwd).toBe(appDir);
    });

    test("should fail without stopping anything when docker is not installed", async () => {
      Bun.which = (() => null) as typeof Bun.which;
      const appDir = join(testDir, "modules", "app");
      await Bun.write(join(appDir, "package.json"), JSON.stringify({ name: "@acme/app" }));
      await Bun.write(join(appDir, "docker-compose.yml"), "version: '3'");
      process.chdir(testDir);

      await command.run();

      expect(spawnCalls).toHaveLength(0);
      expect(process.exitCode).toBe(1);
      process.exitCode = 0;
    });

    test("should handle docker compose failure", async () => {
      Bun.spawn = ((...args: unknown[]) => {
        const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;
        const opts = (Array.isArray(args[0]) ? args[1] : args[0]) as { cwd?: string } | undefined;
        if (Array.isArray(cmd)) {
          spawnCalls.push({ cmd: [...(cmd as string[])], cwd: (opts?.cwd as string) ?? "" });
        }
        return { exited: Promise.resolve(1) } as unknown as ReturnType<typeof Bun.spawn>;
      }) as typeof Bun.spawn;

      await writeModule("app", "api", true);
      process.chdir(testDir);

      await command.run();

      expect(spawnCalls).toHaveLength(1);
    });

    test("should use directory name when package.json has no name", async () => {
      const appDir = join(testDir, "modules", "app");
      await Bun.write(join(appDir, "package.json"), JSON.stringify({}));
      await Bun.write(join(appDir, "app.yml"), 'type: "api"\n');
      await Bun.write(join(appDir, "docker-compose.yml"), "version: '3'");
      process.chdir(testDir);

      await command.run();

      expect(spawnCalls).toHaveLength(1);
    });

    test("should stop the app Docker stack when a named api/microservice module is selected", async () => {
      const appDir = await writeModule("app", "api", true);
      await writeModule("order", "api", false);
      process.chdir(testDir);

      await command.run({ modules: "order" });

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0]?.cmd).toEqual(["docker", "compose", "down"]);
      expect(spawnCalls[0]?.cwd).toBe(appDir);
    });

    test("should accept --packages as an alias for --modules", async () => {
      const appDir = await writeModule("app", "api", true);
      await writeModule("billing", "microservice", false);
      process.chdir(testDir);

      await command.run({ packages: "billing" });

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0]?.cwd).toBe(appDir);
    });

    test("should skip Docker when only dev-server modules are selected", async () => {
      await writeModule("app", "api", true);
      await writeModule("dashboard", "spa", false);
      process.chdir(testDir);

      await command.run({ modules: "dashboard" });

      expect(spawnCalls).toHaveLength(0);
      expect(process.exitCode).toBe(1);
      process.exitCode = 0;
    });

    test("should error when the app has no docker-compose.yml", async () => {
      await writeModule("app", "api", false);
      await writeModule("order", "api", false);
      process.chdir(testDir);

      await command.run({ modules: "order" });

      expect(spawnCalls).toHaveLength(0);
      expect(process.exitCode).toBe(1);
      process.exitCode = 0;
    });
  });
});
