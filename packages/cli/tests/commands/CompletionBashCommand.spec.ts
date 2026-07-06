import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import * as nodeOs from "node:os";
import { join } from "node:path";

const testHome = mkdtempSync(join(nodeOs.tmpdir(), "talos-completion-bash-"));

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

// Mock homedir so completion files are written to an isolated temp dir
mock.module("node:os", () => ({
  ...nodeOs,
  homedir: () => testHome,
}));

const { CompletionBashCommand } = await import("@/commands/CompletionBashCommand");

describe("CompletionBashCommand", () => {
  let command: InstanceType<typeof CompletionBashCommand>;
  let completionDir: string;

  beforeEach(() => {
    command = new CompletionBashCommand();
    completionDir = join(testHome, ".local", "share", "bash-completion", "completions");
  });

  afterEach(() => {
    const ooFilePath = join(completionDir, "oo");
    const talosFilePath = join(completionDir, "talos");

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
      expect(command.getName()).toBe("completion:bash");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Install Bash completion for oo command");
    });
  });

  describe("run()", () => {
    test("should generate the oo completion file", async () => {
      await command.run();

      const filePath = join(completionDir, "oo");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("_talos()");
      expect(content).toContain("complete -F _talos oo talos");
    });

    test("should generate the talos completion file", async () => {
      await command.run();

      const filePath = join(completionDir, "talos");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("_talos()");
      expect(content).toContain("complete -F _talos oo talos");
    });

    test("should write identical content to both files", async () => {
      await command.run();

      const ooContent = await Bun.file(join(completionDir, "oo")).text();
      const talosContent = await Bun.file(join(completionDir, "talos")).text();
      expect(ooContent).toBe(talosContent);
    });

    test("should include command names and helpers", async () => {
      await command.run();

      const content = await Bun.file(join(completionDir, "talos")).text();
      expect(content).toContain("app:create");
      expect(content).toContain("controller:create");
      expect(content).toContain("module:create");
      expect(content).toContain("completion:bash");
      expect(content).toContain("completion:fish");
      expect(content).toContain("_talos_modules()");
    });

    test("should write completion files under the bash-completion directory", async () => {
      await command.run();

      expect(existsSync(join(completionDir, "oo"))).toBe(true);
      expect(existsSync(join(completionDir, "talos"))).toBe(true);
    });
  });
});
