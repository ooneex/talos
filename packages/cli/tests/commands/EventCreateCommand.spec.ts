import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import moduleTemplate from "@/templates/module/module.txt";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

const { EventCreateCommand } = await import("@/commands/EventCreateCommand");

const exists = (path: string) => Bun.file(path).exists();

describe("EventCreateCommand", () => {
  let command: InstanceType<typeof EventCreateCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    command = new EventCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `pubsub-${Date.now()}`);

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
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("event:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Generate a new event class");
    });
  });

  describe("override option", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "events", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "events", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should override existing file when override option is passed", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "events", "UserEvent.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "User", override: true });

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("// existing content");
      expect(content).toContain("User");
    });

    test("should not override existing file when prompt is declined", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "events", "UserEvent.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "User" });

      const content = await Bun.file(filePath).text();
      expect(content).toBe("// existing content");
    });
  });

  describe("run()", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "events", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "events", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should generate event file with correct name", async () => {
      await command.run({ name: "UserCreated" });

      const filePath = join(testDir, "modules", "shared", "src", "events", "UserCreatedEvent.ts");
      expect(await exists(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("UserCreatedEvent");
    });

    test("should generate test file for event", async () => {
      await command.run({ name: "UserCreated" });

      const testFilePath = join(testDir, "modules", "shared", "tests", "events", "UserCreatedEvent.spec.ts");
      expect(await exists(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).toContain("UserCreated");
    });

    test("should normalize name with toPascalCase", async () => {
      await command.run({ name: "order-placed" });

      const filePath = join(testDir, "modules", "shared", "src", "events", "OrderPlacedEvent.ts");
      expect(await exists(filePath)).toBe(true);
    });

    test("should remove PubSub suffix if provided", async () => {
      await command.run({ name: "UserCreatedPubSub" });

      const filePath = join(testDir, "modules", "shared", "src", "events", "UserCreatedEvent.ts");
      expect(await exists(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("UserCreatedPubSubEvent");
    });

    test("should remove Event suffix if provided", async () => {
      await command.run({ name: "UserCreatedEvent" });

      const filePath = join(testDir, "modules", "shared", "src", "events", "UserCreatedEvent.ts");
      expect(await exists(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("UserCreatedEvent");
      expect(content).not.toContain("UserCreatedEventEvent");
    });

    test("should use default kebab-case channel name", async () => {
      await command.run({ name: "UserCreated" });

      const filePath = join(testDir, "modules", "shared", "src", "events", "UserCreatedEvent.ts");
      const content = await Bun.file(filePath).text();

      expect(content).toContain("user-created");
    });

    test("should use custom channel name when provided", async () => {
      await command.run({ name: "UserCreated", channel: "users.created" });

      const filePath = join(testDir, "modules", "shared", "src", "events", "UserCreatedEvent.ts");
      const content = await Bun.file(filePath).text();

      expect(content).toContain("users.created");
    });

    test("should handle lowercase input", async () => {
      await command.run({ name: "notification" });

      const filePath = join(testDir, "modules", "shared", "src", "events", "NotificationEvent.ts");
      expect(await exists(filePath)).toBe(true);
    });

    test("should handle snake_case input", async () => {
      await command.run({ name: "payment_received" });

      const filePath = join(testDir, "modules", "shared", "src", "events", "PaymentReceivedEvent.ts");
      expect(await exists(filePath)).toBe(true);
    });

    test("should replace template placeholders correctly", async () => {
      await command.run({ name: "EmailSent" });

      const filePath = join(testDir, "modules", "shared", "src", "events", "EmailSentEvent.ts");
      const content = await Bun.file(filePath).text();

      expect(content).not.toContain("{{NAME}}");
      expect(content).not.toContain("{{CHANNEL}}");
      expect(content).toContain("EmailSent");
    });

    test("should derive channel from multi-word name", async () => {
      await command.run({ name: "OrderPaymentProcessed" });

      const filePath = join(testDir, "modules", "shared", "src", "events", "OrderPaymentProcessedEvent.ts");
      const content = await Bun.file(filePath).text();

      expect(content).toContain("order-payment-processed");
    });

    test("should replace MODULE placeholder in test file", async () => {
      await Bun.write(join(testDir, "modules", "user-profile", "src", "events", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "user-profile", "tests", "events", ".gitkeep"), "");

      await command.run({ name: "UserCreated", module: "user-profile" });

      const testFilePath = join(testDir, "modules", "user-profile", "tests", "events", "UserCreatedEvent.spec.ts");
      expect(await exists(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).not.toContain("{{MODULE}}");
      expect(content).toContain("@module/user-profile/events/UserCreatedEvent");
    });
  });

  describe("Module integration (default shared module)", () => {
    beforeEach(async () => {
      const moduleContent = moduleTemplate.replace(/{{NAME}}/g, "Shared");
      await Bun.write(join(testDir, "modules", "shared", "src", "SharedModule.ts"), moduleContent);
      await Bun.write(join(testDir, "modules", "shared", "src", "events", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "events", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should add import and class to module events array", async () => {
      await command.run({ name: "PostPublished" });

      const content = await Bun.file(join(testDir, "modules", "shared", "src", "SharedModule.ts")).text();
      expect(content).toContain('import { PostPublishedEvent } from "./events/PostPublishedEvent"');
      expect(content).toMatch(/events:\s*\[.*PostPublishedEvent.*\]/s);
    });

    test("should accumulate multiple events in module", async () => {
      await command.run({ name: "PostPublished" });
      await command.run({ name: "CommentAdded" });

      const content = await Bun.file(join(testDir, "modules", "shared", "src", "SharedModule.ts")).text();
      expect(content).toContain('import { PostPublishedEvent } from "./events/PostPublishedEvent"');
      expect(content).toContain('import { CommentAddedEvent } from "./events/CommentAddedEvent"');
      expect(content).toMatch(/events:\s*\[.*PostPublishedEvent.*CommentAddedEvent.*\]/s);
    });
  });

  describe("Module integration (with module parameter)", () => {
    beforeEach(async () => {
      testDir = join(originalCwd, ".temp", `pubsub-module-${Date.now()}`);
      const moduleContent = moduleTemplate.replace(/{{NAME}}/g, "Blog");
      await Bun.write(join(testDir, "modules", "blog", "src", "BlogModule.ts"), moduleContent);
      await Bun.write(join(testDir, "modules", "blog", "src", "events", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "blog", "tests", "events", ".gitkeep"), "");
      await Bun.write(
        join(testDir, "modules", "blog", "package.json"),
        JSON.stringify({ name: "@module/blog" }, null, 2),
      );
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should generate files under modules directory", async () => {
      await command.run({ name: "PostPublished", module: "blog" });

      const eventPath = join(testDir, "modules", "blog", "src", "events", "PostPublishedEvent.ts");
      expect(await exists(eventPath)).toBe(true);

      const testFilePath = join(testDir, "modules", "blog", "tests", "events", "PostPublishedEvent.spec.ts");
      expect(await exists(testFilePath)).toBe(true);
    });

    test("should add import and class to module events array", async () => {
      await command.run({ name: "PostPublished", module: "blog" });

      const content = await Bun.file(join(testDir, "modules", "blog", "src", "BlogModule.ts")).text();
      expect(content).toContain('import { PostPublishedEvent } from "./events/PostPublishedEvent"');
      expect(content).toMatch(/events:\s*\[.*PostPublishedEvent.*\]/s);
    });

    test("should accumulate multiple events in module", async () => {
      await command.run({ name: "PostPublished", module: "blog" });
      await command.run({ name: "CommentAdded", module: "blog" });

      const content = await Bun.file(join(testDir, "modules", "blog", "src", "BlogModule.ts")).text();
      expect(content).toContain('import { PostPublishedEvent } from "./events/PostPublishedEvent"');
      expect(content).toContain('import { CommentAddedEvent } from "./events/CommentAddedEvent"');
      expect(content).toMatch(/events:\s*\[.*PostPublishedEvent.*CommentAddedEvent.*\]/s);
    });
  });
});
