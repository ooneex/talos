import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { HelpCommand } from "@/commands/HelpCommand";

describe("HelpCommand", () => {
  let command: HelpCommand;
  let originalWrite: typeof process.stdout.write;
  let output: string;

  beforeEach(() => {
    command = new HelpCommand();
    output = "";
    originalWrite = process.stdout.write;
    process.stdout.write = mock((chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    }) as typeof process.stdout.write;
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("help");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Show available commands");
    });
  });

  describe("run()", () => {
    test("should print available commands header", () => {
      command.run();

      expect(output).toContain("Available commands:");
    });

    test("should print commands sorted alphabetically", () => {
      command.run();

      const lines = output.split("\n").filter((line) => line.startsWith("  "));
      const names = lines.map((line) => line.trim().split(/\s{2,}/)[0]);

      for (let i = 1; i < names.length; i++) {
        const prev = names[i - 1];
        const curr = names[i];
        if (prev && curr) {
          expect(prev.localeCompare(curr)).toBeLessThanOrEqual(0);
        }
      }
    });

    test("should include help command", () => {
      command.run();

      expect(output).toContain("help");
      expect(output).toContain("Show available commands");
    });
  });
});
