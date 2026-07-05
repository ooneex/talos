import { beforeEach, describe, expect, mock, test } from "bun:test";
import { TerminalLogger } from "@talosjs/logger";
import { SEEDS_CACHE_DIR } from "@talosjs/seeds";

const runModuleScripts = mock((..._args: unknown[]) => Promise.resolve());

// Mock the shared helper so the command spec only verifies delegation
mock.module("@/utils", () => ({ runModuleScripts }));

const { SeedRunCommand } = await import("@/commands/SeedRunCommand");

describe("SeedRunCommand", () => {
  let command: InstanceType<typeof SeedRunCommand>;

  beforeEach(() => {
    command = new SeedRunCommand();
    runModuleScripts.mockClear();
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("seed:run");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Run seeds for all modules");
    });
  });

  describe("run()", () => {
    test("should delegate to runModuleScripts with the seed bin path and label", async () => {
      await command.run({ drop: true, env: "production" });

      expect(runModuleScripts).toHaveBeenCalledTimes(1);
      const [, options] = runModuleScripts.mock.calls[0] ?? [];
      expect(options).toEqual({
        binPath: ["bin", "seed", "run.ts"],
        label: "seeds",
        drop: true,
        env: "production",
        noCache: undefined,
        cacheDir: SEEDS_CACHE_DIR,
      });
    });

    test("should forward undefined drop and env when options are omitted", async () => {
      await command.run({});

      const [, options] = runModuleScripts.mock.calls[0] ?? [];
      expect(options).toEqual({
        binPath: ["bin", "seed", "run.ts"],
        label: "seeds",
        drop: undefined,
        env: undefined,
        noCache: undefined,
        cacheDir: SEEDS_CACHE_DIR,
      });
    });

    test("should forward the noCache opt-out to runModuleScripts", async () => {
      await command.run({ noCache: true });

      const [, options] = runModuleScripts.mock.calls[0] ?? [];
      expect(options).toEqual({
        binPath: ["bin", "seed", "run.ts"],
        label: "seeds",
        drop: undefined,
        env: undefined,
        noCache: true,
        cacheDir: SEEDS_CACHE_DIR,
      });
    });

    test("should pass a TerminalLogger as the first argument", async () => {
      await command.run({});

      const [logger] = runModuleScripts.mock.calls[0] ?? [];
      expect(logger).toBeInstanceOf(TerminalLogger);
    });
  });
});
