import { beforeEach, describe, expect, mock, test } from "bun:test";
import { TerminalLogger } from "@talosjs/logger";

const runModuleScripts = mock((..._args: unknown[]) => Promise.resolve());

// Mock the shared helper so the command spec only verifies delegation
mock.module("@/utils", () => ({ runModuleScripts }));

const { MigrationUpCommand } = await import("@/commands/MigrationUpCommand");

describe("MigrationUpCommand", () => {
  let command: InstanceType<typeof MigrationUpCommand>;

  beforeEach(() => {
    command = new MigrationUpCommand();
    runModuleScripts.mockClear();
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("migration:up");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Run migrations for all modules");
    });
  });

  describe("run()", () => {
    test("should delegate to runModuleScripts with the migration bin path and label", async () => {
      await command.run({ drop: true });

      expect(runModuleScripts).toHaveBeenCalledTimes(1);
      const [, options] = runModuleScripts.mock.calls[0] ?? [];
      expect(options).toEqual({
        binPath: ["bin", "migration", "up.ts"],
        label: "migrations",
        drop: true,
        cache: true,
        noCache: undefined,
      });
    });

    test("should forward undefined drop when option is omitted", async () => {
      await command.run({});

      const [, options] = runModuleScripts.mock.calls[0] ?? [];
      expect(options).toEqual({
        binPath: ["bin", "migration", "up.ts"],
        label: "migrations",
        drop: undefined,
        cache: true,
        noCache: undefined,
      });
    });

    test("should forward the noCache opt-out to runModuleScripts", async () => {
      await command.run({ noCache: true });

      const [, options] = runModuleScripts.mock.calls[0] ?? [];
      expect(options).toEqual({
        binPath: ["bin", "migration", "up.ts"],
        label: "migrations",
        drop: undefined,
        cache: true,
        noCache: true,
      });
    });

    test("should pass a TerminalLogger as the first argument", async () => {
      await command.run({});

      const [logger] = runModuleScripts.mock.calls[0] ?? [];
      expect(logger).toBeInstanceOf(TerminalLogger);
    });
  });
});
