import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

const { AiChatCreateCommand } = await import("@/commands/AiChatCreateCommand");

describe("AiChatCreateCommand", () => {
  let command: InstanceType<typeof AiChatCreateCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    command = new AiChatCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `ai-chat-${Date.now()}`);

    // Mock Bun.spawn to avoid running bun add in tests
    originalSpawn = Bun.spawn;
    Bun.spawn = ((...args: unknown[]) => {
      const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;
      if (Array.isArray(cmd) && cmd[0] === "bun" && cmd[1] === "add") {
        return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
      }
      return originalSpawn.apply(Bun, args as Parameters<typeof Bun.spawn>);
    }) as typeof Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("ai:chat:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Generate a new AI chat class");
    });
  });

  describe("run()", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "ai", "chats", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "ai", "chats", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should generate chat file with the Chat suffix", async () => {
      await command.run({ name: "Support" });

      const filePath = join(testDir, "modules", "shared", "src", "ai", "chats", "SupportChat.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("class SupportChat extends Chat");
      expect(content).not.toContain("{{NAME}}");
    });

    test("should generate a test file for the chat", async () => {
      await command.run({ name: "Support" });

      const testFilePath = join(testDir, "modules", "shared", "tests", "ai", "chats", "SupportChat.spec.ts");
      expect(existsSync(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).toContain("@module/shared/ai/chats/SupportChat");
      expect(content).not.toContain("{{MODULE}}");
    });

    test("should strip a provided Chat suffix", async () => {
      await command.run({ name: "SupportChat" });

      const filePath = join(testDir, "modules", "shared", "src", "ai", "chats", "SupportChat.ts");
      expect(existsSync(filePath)).toBe(true);
    });
  });
});
