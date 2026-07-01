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
  });
});
