import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import * as nodeOs from "node:os";
import { join } from "node:path";

const testHome = mkdtempSync(join(nodeOs.tmpdir(), "talos-completion-fish-"));

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

// Mock homedir so completion files are written to an isolated temp dir
mock.module("node:os", () => ({
  ...nodeOs,
  homedir: () => testHome,
}));

const { CompletionFishCommand } = await import("@/commands/CompletionFishCommand");

describe("CompletionFishCommand", () => {
  let command: InstanceType<typeof CompletionFishCommand>;
  let completionDir: string;

  beforeEach(() => {
    command = new CompletionFishCommand();
    completionDir = join(testHome, ".config", "fish", "completions");
  });

  afterEach(() => {
    const ooFilePath = join(completionDir, "oo.fish");
    const talosFilePath = join(completionDir, "talos.fish");

    if (existsSync(ooFilePath)) {
      rmSync(ooFilePath);
    }
    if (existsSync(talosFilePath)) {
      rmSync(talosFilePath);
    }
  });

  afterAll(() => {
    rmSync(testHome, { recursive: true, force: true });
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("completion:fish");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Install Fish completion for oo command");
    });
  });

  describe("run()", () => {
    test("should generate the oo.fish completion file", async () => {
      await command.run();

      const filePath = join(completionDir, "oo.fish");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("for cmd in oo talos");
      expect(content).toContain("complete -c $cmd");
    });

    test("should generate the talos.fish completion file", async () => {
      await command.run();

      const filePath = join(completionDir, "talos.fish");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("for cmd in oo talos");
      expect(content).toContain("complete -c $cmd");
    });

    test("should write identical content to both files", async () => {
      await command.run();

      const ooContent = await Bun.file(join(completionDir, "oo.fish")).text();
      const talosContent = await Bun.file(join(completionDir, "talos.fish")).text();
      expect(ooContent).toBe(talosContent);
    });

    test("should include command names and helpers", async () => {
      await command.run();

      const content = await Bun.file(join(completionDir, "talos.fish")).text();
      expect(content).toContain("-a app:create");
      expect(content).toContain("-a controller:create");
      expect(content).toContain("-a module:create");
      expect(content).toContain("-a completion:bash");
      expect(content).toContain("-a completion:fish");
      expect(content).toContain("function __talos_modules");
    });

    test("should write completion files under the fish completions directory", async () => {
      await command.run();

      expect(existsSync(join(completionDir, "oo.fish"))).toBe(true);
      expect(existsSync(join(completionDir, "talos.fish"))).toBe(true);
    });
  });
});
