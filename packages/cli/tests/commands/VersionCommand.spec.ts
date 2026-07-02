import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { join } from "node:path";

// `@/utils` transitively imports enquirer (via ModuleCreateCommand's prompts);
// mock it before importing the command so the module graph resolves.
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

const { VersionCommand } = await import("@/commands/VersionCommand");

const packageVersion = (await Bun.file(join(import.meta.dir, "../../package.json")).json()).version as string;

describe("VersionCommand", () => {
  let command: InstanceType<typeof VersionCommand>;
  const written: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  beforeEach(() => {
    command = new VersionCommand();
    written.length = 0;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      written.push(chunk.toString());
      return true;
    }) as typeof process.stdout.write;
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
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
    test("should print the installed CLI version", async () => {
      await command.run();

      expect(written).toHaveLength(1);
      expect(written[0]).toBe(`${packageVersion}\n`);
    });
  });
});
