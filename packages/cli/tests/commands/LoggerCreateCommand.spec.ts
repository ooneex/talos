import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

const { LoggerCreateCommand } = await import("@/commands/LoggerCreateCommand");

describe("LoggerCreateCommand", () => {
  let command: InstanceType<typeof LoggerCreateCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    command = new LoggerCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `logger-${Date.now()}`);

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
      expect(command.getName()).toBe("logger:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Generate a new logger class");
    });
  });

  describe("override option", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "loggers", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "loggers", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should override existing file when override option is passed", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "loggers", "AppLogger.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "App", override: true });

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("// existing content");
      expect(content).toContain("App");
    });

    test("should not override existing file when prompt is declined", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "loggers", "AppLogger.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "App" });

      const content = await Bun.file(filePath).text();
      expect(content).toBe("// existing content");
    });
  });

  describe("run()", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "loggers", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "loggers", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should generate logger file with correct name", async () => {
      await command.run({ name: "File" });

      const filePath = join(testDir, "modules", "shared", "src", "loggers", "FileLogger.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("FileLogger");
    });

    test("should generate test file for logger", async () => {
      await command.run({ name: "File" });

      const testFilePath = join(testDir, "modules", "shared", "tests", "loggers", "FileLogger.spec.ts");
      expect(existsSync(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).toContain("FileLogger");
    });

    test("should normalize name with toPascalCase", async () => {
      await command.run({ name: "cloud-watch" });

      const filePath = join(testDir, "modules", "shared", "src", "loggers", "CloudWatchLogger.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should remove Logger suffix if provided", async () => {
      await command.run({ name: "FileLogger" });

      const filePath = join(testDir, "modules", "shared", "src", "loggers", "FileLogger.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("FileLoggerLogger");
    });

    test("should handle lowercase input", async () => {
      await command.run({ name: "console" });

      const filePath = join(testDir, "modules", "shared", "src", "loggers", "ConsoleLogger.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should handle snake_case input", async () => {
      await command.run({ name: "json_file" });

      const filePath = join(testDir, "modules", "shared", "src", "loggers", "JsonFileLogger.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should replace template placeholders correctly", async () => {
      await command.run({ name: "Sentry" });

      const filePath = join(testDir, "modules", "shared", "src", "loggers", "SentryLogger.ts");
      const content = await Bun.file(filePath).text();

      expect(content).not.toContain("{{NAME}}");
      expect(content).toContain("Sentry");
    });

    test("should replace MODULE placeholder in test file", async () => {
      await Bun.write(join(testDir, "modules", "user-profile", "src", "loggers", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "user-profile", "tests", "loggers", ".gitkeep"), "");

      await command.run({ name: "File", module: "user-profile" });

      const testFilePath = join(testDir, "modules", "user-profile", "tests", "loggers", "FileLogger.spec.ts");
      expect(existsSync(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).not.toContain("{{MODULE}}");
      expect(content).toContain("@module/user-profile/loggers/FileLogger");
    });
  });
});
