import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { CommandRunCommand } from "@/commands/CommandRunCommand";

describe("CommandRunCommand", () => {
  let command: CommandRunCommand;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;
  let originalArgv: string[];
  let spawnCalls: { cmd: string[]; cwd: string }[];

  const mockSpawn = (exitCode = 0, stdout = "", stderr = "") => {
    Bun.spawn = ((...args: unknown[]) => {
      const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;
      const opts = (Array.isArray(args[0]) ? args[1] : args[0]) as { cwd?: string } | undefined;
      if (Array.isArray(cmd)) {
        spawnCalls.push({ cmd: [...(cmd as string[])], cwd: (opts?.cwd as string) ?? "" });
      }
      return {
        stdout: new Response(stdout).body,
        stderr: new Response(stderr).body,
        exited: Promise.resolve(exitCode),
      } as unknown as ReturnType<typeof Bun.spawn>;
    }) as typeof Bun.spawn;
  };

  beforeEach(() => {
    command = new CommandRunCommand();
    originalCwd = process.cwd();
    originalArgv = [...Bun.argv];
    testDir = join(originalCwd, ".temp", `command-run-${Date.now()}`);
    spawnCalls = [];
    mockSpawn(0);
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
    (Bun as { argv: string[] }).argv = originalArgv;
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // Save originalSpawn before any beforeEach runs
  originalSpawn = Bun.spawn;

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("command:run");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Run a custom command from a module");
    });
  });

  describe("run()", () => {
    test("should error when no command name is provided", async () => {
      (Bun as { argv: string[] }).argv = ["bun", "run", "command:run"];
      await Bun.write(join(testDir, ".gitkeep"), "");
      process.chdir(testDir);

      await command.run();

      expect(spawnCalls).toHaveLength(0);
    });

    test("should warn when no modules directory exists", async () => {
      (Bun as { argv: string[] }).argv = ["bun", "run", "command:run", "user:create"];
      await Bun.write(join(testDir, ".gitkeep"), "");
      process.chdir(testDir);

      await command.run();

      expect(spawnCalls).toHaveLength(0);
    });

    test("should warn when no modules have bin/command/run.ts", async () => {
      (Bun as { argv: string[] }).argv = ["bun", "run", "command:run", "user:create"];
      const moduleDir = join(testDir, "modules", "auth");
      await Bun.write(join(moduleDir, "package.json"), JSON.stringify({ name: "@acme/auth" }));
      process.chdir(testDir);

      await command.run();

      expect(spawnCalls).toHaveLength(0);
    });

    test("should spawn subprocess with command name", async () => {
      (Bun as { argv: string[] }).argv = ["bun", "run", "command:run", "user:create"];
      const moduleDir = join(testDir, "modules", "auth");
      await Bun.write(join(moduleDir, "package.json"), JSON.stringify({ name: "@acme/auth" }));
      await Bun.write(join(moduleDir, "bin", "command", "run.ts"), "// commands");
      process.chdir(testDir);

      await command.run();

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0]?.cmd).toEqual(["bun", "run", join(moduleDir, "bin", "command", "run.ts"), "user:create"]);
      expect(spawnCalls[0]?.cwd).toBe(testDir);
    });

    test("should pass extra args to subprocess", async () => {
      (Bun as { argv: string[] }).argv = ["bun", "run", "command:run", "user:create", "--name", "John"];
      const moduleDir = join(testDir, "modules", "auth");
      await Bun.write(join(moduleDir, "package.json"), JSON.stringify({ name: "@acme/auth" }));
      await Bun.write(join(moduleDir, "bin", "command", "run.ts"), "// commands");
      process.chdir(testDir);

      await command.run();

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0]?.cmd).toEqual([
        "bun",
        "run",
        join(moduleDir, "bin", "command", "run.ts"),
        "user:create",
        "--name",
        "John",
      ]);
    });

    test("should stop at first successful module", async () => {
      (Bun as { argv: string[] }).argv = ["bun", "run", "command:run", "user:create"];

      const authDir = join(testDir, "modules", "auth");
      await Bun.write(join(authDir, "package.json"), JSON.stringify({ name: "@acme/auth" }));
      await Bun.write(join(authDir, "bin", "command", "run.ts"), "// commands");
      await Bun.write(
        join(authDir, "src", "commands", "UserCreateCommand.ts"),
        'export class UserCreateCommand { public getName(): string { return "user:create"; } }',
      );

      const billingDir = join(testDir, "modules", "billing");
      await Bun.write(join(billingDir, "package.json"), JSON.stringify({ name: "@acme/billing" }));
      await Bun.write(join(billingDir, "bin", "command", "run.ts"), "// commands");
      await Bun.write(
        join(billingDir, "src", "commands", "UserCreateCommand.ts"),
        'export class UserCreateCommand { public getName(): string { return "user:create"; } }',
      );
      process.chdir(testDir);

      mockSpawn(0);
      await command.run();

      expect(spawnCalls).toHaveLength(1);
    });

    test("should run the module that declares the exact command name", async () => {
      (Bun as { argv: string[] }).argv = ["bun", "run", "command:run", "sanitize:video"];

      const articleDir = join(testDir, "modules", "article");
      await Bun.write(join(articleDir, "package.json"), JSON.stringify({ name: "@acme/article" }));
      await Bun.write(join(articleDir, "bin", "command", "run.ts"), "// commands");
      await Bun.write(
        join(articleDir, "src", "commands", "SanitizeArticleCommand.ts"),
        'export class SanitizeArticleCommand { public getName(): string { return "sanitize:article"; } }',
      );

      const videoDir = join(testDir, "modules", "video");
      await Bun.write(join(videoDir, "package.json"), JSON.stringify({ name: "@acme/video" }));
      await Bun.write(join(videoDir, "bin", "command", "run.ts"), "// commands");
      await Bun.write(
        join(videoDir, "src", "commands", "SanitizeVideoCommand.ts"),
        'export class SanitizeVideoCommand { public getName(): string { return "sanitize:video"; } }',
      );
      process.chdir(testDir);

      mockSpawn(0);
      await command.run();

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0]?.cmd).toEqual(["bun", "run", join(videoDir, "bin", "command", "run.ts"), "sanitize:video"]);
    });

    test("should try next module when first fails", async () => {
      (Bun as { argv: string[] }).argv = ["bun", "run", "command:run", "user:create"];
      let callCount = 0;

      const authDir = join(testDir, "modules", "auth");
      await Bun.write(join(authDir, "package.json"), JSON.stringify({ name: "@acme/auth" }));
      await Bun.write(join(authDir, "bin", "command", "run.ts"), "// commands");

      const billingDir = join(testDir, "modules", "billing");
      await Bun.write(join(billingDir, "package.json"), JSON.stringify({ name: "@acme/billing" }));
      await Bun.write(join(billingDir, "bin", "command", "run.ts"), "// commands");
      process.chdir(testDir);

      Bun.spawn = ((...args: unknown[]) => {
        callCount++;
        const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;
        const opts = (Array.isArray(args[0]) ? args[1] : args[0]) as { cwd?: string } | undefined;
        if (Array.isArray(cmd)) {
          spawnCalls.push({ cmd: [...(cmd as string[])], cwd: (opts?.cwd as string) ?? "" });
        }
        const exitCode = callCount === 1 ? 1 : 0;
        return {
          stdout: new Response("").body,
          stderr: new Response("").body,
          exited: Promise.resolve(exitCode),
        } as unknown as ReturnType<typeof Bun.spawn>;
      }) as typeof Bun.spawn;

      await command.run();

      expect(spawnCalls).toHaveLength(2);
    });

    test("should skip modules without bin/command/run.ts", async () => {
      (Bun as { argv: string[] }).argv = ["bun", "run", "command:run", "user:create"];

      const authDir = join(testDir, "modules", "auth");
      await Bun.write(join(authDir, "package.json"), JSON.stringify({ name: "@acme/auth" }));
      await Bun.write(join(authDir, "bin", "command", "run.ts"), "// commands");

      const billingDir = join(testDir, "modules", "billing");
      await Bun.write(join(billingDir, "package.json"), JSON.stringify({ name: "@acme/billing" }));
      process.chdir(testDir);

      await command.run();

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0]?.cwd).toBe(testDir);
    });

    test("should use directory name when package.json has no name", async () => {
      (Bun as { argv: string[] }).argv = ["bun", "run", "command:run", "user:create"];
      const moduleDir = join(testDir, "modules", "auth");
      await Bun.write(join(moduleDir, "package.json"), JSON.stringify({}));
      await Bun.write(join(moduleDir, "bin", "command", "run.ts"), "// commands");
      process.chdir(testDir);

      await command.run();

      expect(spawnCalls).toHaveLength(1);
    });

    test("should handle all modules failing", async () => {
      (Bun as { argv: string[] }).argv = ["bun", "run", "command:run", "unknown:command"];
      mockSpawn(1);

      const authDir = join(testDir, "modules", "auth");
      await Bun.write(join(authDir, "package.json"), JSON.stringify({ name: "@acme/auth" }));
      await Bun.write(join(authDir, "bin", "command", "run.ts"), "// commands");

      const billingDir = join(testDir, "modules", "billing");
      await Bun.write(join(billingDir, "package.json"), JSON.stringify({ name: "@acme/billing" }));
      await Bun.write(join(billingDir, "bin", "command", "run.ts"), "// commands");
      process.chdir(testDir);

      await command.run();

      expect(spawnCalls).toHaveLength(2);
    });
  });
});
