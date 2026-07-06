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
      const appDir = join(testDir, "modules", "app");
      await Bun.write(join(appDir, "package.json"), JSON.stringify({ name: "@acme/app" }));
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

    test("should stop only the selected api modules' Docker stacks when --api is set", async () => {
      const appDir = await writeModule("app", "api", true);
      const orderDir = await writeModule("order", "api", true);
      await writeModule("billing", "microservice", true);
      process.chdir(testDir);

      await command.run({ api: true });

      expect(spawnCalls).toHaveLength(2);
      expect(spawnCalls.every((call) => call.cmd.join(" ") === "docker compose down")).toBe(true);
      expect(spawnCalls.map((call) => call.cwd).sort()).toEqual([appDir, orderDir].sort());
    });

    test("should stop only the named module when --api=name is set", async () => {
      await writeModule("app", "api", true);
      const orderDir = await writeModule("order", "api", true);
      process.chdir(testDir);

      await command.run({ api: "order" });

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0]?.cwd).toBe(orderDir);
    });

    test("should skip selected modules without a docker-compose.yml", async () => {
      await writeModule("app", "api", true);
      await writeModule("dashboard", "spa", false);
      process.chdir(testDir);

      await command.run({ spa: true });

      expect(spawnCalls).toHaveLength(0);
    });

    test("should error when no selected module has a Docker stack", async () => {
      await writeModule("app", "api", true);
      await writeModule("billing", "microservice", true);
      process.chdir(testDir);

      await command.run({ spa: true });

      expect(spawnCalls).toHaveLength(0);
      expect(process.exitCode).toBe(1);
      process.exitCode = 0;
    });
  });
});
