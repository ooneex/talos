import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

const { QueueCreateCommand } = await import("@/commands/QueueCreateCommand");

describe("QueueCreateCommand", () => {
  let command: InstanceType<typeof QueueCreateCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    command = new QueueCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `queue-${Date.now()}`);

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
      expect(command.getName()).toBe("queue:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Generate a new queue class");
    });
  });

  describe("override option", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "queues", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "queues", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should override existing file when override option is passed", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "queues", "EmailQueue.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "Email", override: true });

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("// existing content");
      expect(content).toContain("Email");
    });

    test("should not override existing file when prompt is declined", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "queues", "EmailQueue.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "Email" });

      const content = await Bun.file(filePath).text();
      expect(content).toBe("// existing content");
    });
  });

  describe("run()", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "queues", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "queues", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should generate queue file with correct name", async () => {
      await command.run({ name: "Email" });

      const filePath = join(testDir, "modules", "shared", "src", "queues", "EmailQueue.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("EmailQueue");
    });

    test("should generate test file for queue", async () => {
      await command.run({ name: "Email" });

      const testFilePath = join(testDir, "modules", "shared", "tests", "queues", "EmailQueue.spec.ts");
      expect(existsSync(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).toContain("EmailQueue");
    });

    test("should normalize name with toPascalCase", async () => {
      await command.run({ name: "email-notification" });

      const filePath = join(testDir, "modules", "shared", "src", "queues", "EmailNotificationQueue.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should remove Queue suffix if provided", async () => {
      await command.run({ name: "EmailQueue" });

      const filePath = join(testDir, "modules", "shared", "src", "queues", "EmailQueue.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("EmailQueueQueue");
    });

    test("should handle lowercase input", async () => {
      await command.run({ name: "payment" });

      const filePath = join(testDir, "modules", "shared", "src", "queues", "PaymentQueue.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should handle snake_case input", async () => {
      await command.run({ name: "order_processing" });

      const filePath = join(testDir, "modules", "shared", "src", "queues", "OrderProcessingQueue.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should replace template placeholders correctly", async () => {
      await command.run({ name: "Notification" });

      const filePath = join(testDir, "modules", "shared", "src", "queues", "NotificationQueue.ts");
      const content = await Bun.file(filePath).text();

      expect(content).not.toContain("{{NAME}}");
      expect(content).toContain("Notification");
    });

    test("should replace MODULE placeholder in test file", async () => {
      await Bun.write(join(testDir, "modules", "user-profile", "src", "queues", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "user-profile", "tests", "queues", ".gitkeep"), "");

      await command.run({ name: "Email", module: "user-profile" });

      const testFilePath = join(testDir, "modules", "user-profile", "tests", "queues", "EmailQueue.spec.ts");
      expect(existsSync(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).not.toContain("{{MODULE}}");
      expect(content).toContain("@module/user-profile/queues/EmailQueue");
    });
  });
});
