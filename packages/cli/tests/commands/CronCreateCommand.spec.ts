import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import moduleTemplate from "@/templates/module/module.txt";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

const { CronCreateCommand } = await import("@/commands/CronCreateCommand");

const exists = (path: string) => Bun.file(path).exists();

describe("CronCreateCommand", () => {
  let command: InstanceType<typeof CronCreateCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    command = new CronCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `cron-${Date.now()}`);

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
      expect(command.getName()).toBe("cron:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Generate a new cron class");
    });
  });

  describe("override option", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "crons", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "crons", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should override existing file when override option is passed", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "crons", "CleanupCron.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "Cleanup", override: true });

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("// existing content");
      expect(content).toContain("Cleanup");
    });

    test("should not override existing file when prompt is declined", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "crons", "CleanupCron.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "Cleanup" });

      const content = await Bun.file(filePath).text();
      expect(content).toBe("// existing content");
    });
  });

  describe("run()", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "crons", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "crons", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should generate cron file with correct name", async () => {
      await command.run({ name: "Cleanup" });

      const filePath = join(testDir, "modules", "shared", "src", "crons", "CleanupCron.ts");
      expect(await exists(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("CleanupCron");
    });

    test("should generate test file for cron", async () => {
      await command.run({ name: "Cleanup" });

      const testFilePath = join(testDir, "modules", "shared", "tests", "crons", "CleanupCron.spec.ts");
      expect(await exists(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).toContain("CleanupCron");
    });

    test("should normalize name with toPascalCase", async () => {
      await command.run({ name: "daily-report" });

      const filePath = join(testDir, "modules", "shared", "src", "crons", "DailyReportCron.ts");
      expect(await exists(filePath)).toBe(true);
    });

    test("should remove Cron suffix if provided", async () => {
      await command.run({ name: "CleanupCron" });

      const filePath = join(testDir, "modules", "shared", "src", "crons", "CleanupCron.ts");
      expect(await exists(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("CleanupCronCron");
    });

    test("should handle lowercase input", async () => {
      await command.run({ name: "backup" });

      const filePath = join(testDir, "modules", "shared", "src", "crons", "BackupCron.ts");
      expect(await exists(filePath)).toBe(true);
    });

    test("should handle snake_case input", async () => {
      await command.run({ name: "send_newsletter" });

      const filePath = join(testDir, "modules", "shared", "src", "crons", "SendNewsletterCron.ts");
      expect(await exists(filePath)).toBe(true);
    });

    test("should replace template placeholders correctly", async () => {
      await command.run({ name: "Sync" });

      const filePath = join(testDir, "modules", "shared", "src", "crons", "SyncCron.ts");
      const content = await Bun.file(filePath).text();

      expect(content).not.toContain("{{NAME}}");
      expect(content).toContain("Sync");
    });

    test("should replace MODULE placeholder in test file", async () => {
      await Bun.write(join(testDir, "modules", "user-profile", "src", "crons", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "user-profile", "tests", "crons", ".gitkeep"), "");

      await command.run({ name: "Cleanup", module: "user-profile" });

      const testFilePath = join(testDir, "modules", "user-profile", "tests", "crons", "CleanupCron.spec.ts");
      expect(await exists(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).not.toContain("{{MODULE}}");
      expect(content).toContain("@module/user-profile/cron/CleanupCron");
    });
  });

  describe("Module integration (default shared module)", () => {
    beforeEach(async () => {
      const moduleContent = moduleTemplate.replace(/{{NAME}}/g, "Shared");
      await Bun.write(join(testDir, "modules", "shared", "src", "SharedModule.ts"), moduleContent);
      await Bun.write(join(testDir, "modules", "shared", "src", "crons", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "crons", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should add import and class to module cronJobs array", async () => {
      await command.run({ name: "Cleanup" });

      const content = await Bun.file(join(testDir, "modules", "shared", "src", "SharedModule.ts")).text();
      expect(content).toContain('import { CleanupCron } from "./crons/CleanupCron"');
      expect(content).toMatch(/cronJobs:\s*\[.*CleanupCron.*\]/s);
    });

    test("should accumulate multiple cron jobs in module", async () => {
      await command.run({ name: "Cleanup" });
      await command.run({ name: "Backup" });

      const content = await Bun.file(join(testDir, "modules", "shared", "src", "SharedModule.ts")).text();
      expect(content).toContain('import { CleanupCron } from "./crons/CleanupCron"');
      expect(content).toContain('import { BackupCron } from "./crons/BackupCron"');
      expect(content).toMatch(/cronJobs:\s*\[.*CleanupCron.*BackupCron.*\]/s);
    });
  });

  describe("Module integration (with module parameter)", () => {
    beforeEach(async () => {
      testDir = join(originalCwd, ".temp", `cron-module-${Date.now()}`);
      const moduleContent = moduleTemplate.replace(/{{NAME}}/g, "Blog");
      await Bun.write(join(testDir, "modules", "blog", "src", "BlogModule.ts"), moduleContent);
      await Bun.write(join(testDir, "modules", "blog", "src", "crons", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "blog", "tests", "crons", ".gitkeep"), "");
      await Bun.write(
        join(testDir, "modules", "blog", "package.json"),
        JSON.stringify({ name: "@module/blog" }, null, 2),
      );
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should generate files under modules directory", async () => {
      await command.run({ name: "Cleanup", module: "blog" });

      const cronPath = join(testDir, "modules", "blog", "src", "crons", "CleanupCron.ts");
      expect(await exists(cronPath)).toBe(true);

      const testFilePath = join(testDir, "modules", "blog", "tests", "crons", "CleanupCron.spec.ts");
      expect(await exists(testFilePath)).toBe(true);
    });

    test("should add import and class to module cronJobs array", async () => {
      await command.run({ name: "Cleanup", module: "blog" });

      const content = await Bun.file(join(testDir, "modules", "blog", "src", "BlogModule.ts")).text();
      expect(content).toContain('import { CleanupCron } from "./crons/CleanupCron"');
      expect(content).toMatch(/cronJobs:\s*\[.*CleanupCron.*\]/s);
    });

    test("should accumulate multiple cron jobs in module", async () => {
      await command.run({ name: "Cleanup", module: "blog" });
      await command.run({ name: "Backup", module: "blog" });

      const content = await Bun.file(join(testDir, "modules", "blog", "src", "BlogModule.ts")).text();
      expect(content).toContain('import { CleanupCron } from "./crons/CleanupCron"');
      expect(content).toContain('import { BackupCron } from "./crons/BackupCron"');
      expect(content).toMatch(/cronJobs:\s*\[.*CleanupCron.*BackupCron.*\]/s);
    });
  });
});
