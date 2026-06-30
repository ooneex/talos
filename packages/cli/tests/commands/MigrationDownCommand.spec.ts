import { beforeEach, describe, expect, mock, test } from "bun:test";
import { TerminalLogger } from "@talosjs/logger";

const runModuleScripts = mock((..._args: unknown[]) => Promise.resolve());

// Mock the shared helper so the command spec only verifies delegation
mock.module("@/utils", () => ({ runModuleScripts }));

const { MigrationDownCommand } = await import("@/commands/MigrationDownCommand");

describe("MigrationDownCommand", () => {
  let command: InstanceType<typeof MigrationDownCommand>;

  beforeEach(() => {
    command = new MigrationDownCommand();
    runModuleScripts.mockClear();
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("migration:down");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Roll back migrations for all modules");
    });
  });

  describe("run()", () => {
    test("should delegate to runModuleScripts with the migration bin path and version", async () => {
      await command.run({ version: "20240101120000" });

      expect(runModuleScripts).toHaveBeenCalledTimes(1);
      const [, options] = runModuleScripts.mock.calls[0] ?? [];
      expect(options).toEqual({
        binPath: ["bin", "migration", "down.ts"],
        label: "migrations",
        version: "20240101120000",
      });
    });

    test("should forward undefined version when option is omitted", async () => {
      await command.run({});

      const [, options] = runModuleScripts.mock.calls[0] ?? [];
      expect(options).toEqual({
        binPath: ["bin", "migration", "down.ts"],
        label: "migrations",
        version: undefined,
      });
    });

    test("should pass a TerminalLogger as the first argument", async () => {
      await command.run({});

      const [logger] = runModuleScripts.mock.calls[0] ?? [];
      expect(logger).toBeInstanceOf(TerminalLogger);
    });
  });
});
