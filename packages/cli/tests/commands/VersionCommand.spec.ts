import { beforeEach, describe, expect, mock, test } from "bun:test";
import { join } from "node:path";

// `@/utils` transitively imports enquirer (via ModuleCreateCommand's prompts);
// mock it before importing the command so the module graph resolves.
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

const infoMessages: string[] = [];

// Capture logger output so the printed version can be asserted.
mock.module("@talosjs/logger", () => ({
  TerminalLogger: class {
    info(message: string) {
      infoMessages.push(message);
    }
    success() {}
    error() {}
    warn() {}
  },
}));

const { VersionCommand } = await import("@/commands/VersionCommand");

const packageVersion = (await Bun.file(join(import.meta.dir, "../../package.json")).json()).version as string;

describe("VersionCommand", () => {
  let command: InstanceType<typeof VersionCommand>;

  beforeEach(() => {
    command = new VersionCommand();
    infoMessages.length = 0;
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("version");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Print the installed CLI version");
    });
  });

  describe("run()", () => {
    test("should print the installed CLI version prefixed with v", async () => {
      await command.run();

      expect(infoMessages).toHaveLength(1);
      expect(infoMessages[0]).toBe(`v${packageVersion}`);
    });
  });
});
