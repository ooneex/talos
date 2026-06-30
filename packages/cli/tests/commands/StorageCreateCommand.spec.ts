import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

const { StorageCreateCommand } = await import("@/commands/StorageCreateCommand");

describe("StorageCreateCommand", () => {
  let command: InstanceType<typeof StorageCreateCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    command = new StorageCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `storage-${Date.now()}`);

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
      expect(command.getName()).toBe("storage:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Generate a new storage class");
    });
  });

  describe("override option", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "storage", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "storage", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should override existing file when override option is passed", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "storage", "AvatarStorage.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "Avatar", override: true });

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("// existing content");
      expect(content).toContain("Avatar");
    });

    test("should not override existing file when prompt is declined", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "storage", "AvatarStorage.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "Avatar" });

      const content = await Bun.file(filePath).text();
      expect(content).toBe("// existing content");
    });
  });

  describe("run()", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "storage", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "storage", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should generate storage file with correct name", async () => {
      await command.run({ name: "S3" });

      const filePath = join(testDir, "modules", "shared", "src", "storage", "S3Storage.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("S3Storage");
    });

    test("should generate test file for storage", async () => {
      await command.run({ name: "S3" });

      const testFilePath = join(testDir, "modules", "shared", "tests", "storage", "S3Storage.spec.ts");
      expect(existsSync(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).toContain("S3Storage");
    });

    test("should normalize name with toPascalCase", async () => {
      await command.run({ name: "google-cloud" });

      const filePath = join(testDir, "modules", "shared", "src", "storage", "GoogleCloudStorage.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should remove Storage suffix if provided", async () => {
      await command.run({ name: "S3Storage" });

      const filePath = join(testDir, "modules", "shared", "src", "storage", "S3Storage.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("S3StorageStorage");
    });

    test("should handle lowercase input", async () => {
      await command.run({ name: "local" });

      const filePath = join(testDir, "modules", "shared", "src", "storage", "LocalStorage.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should handle snake_case input", async () => {
      await command.run({ name: "azure_blob" });

      const filePath = join(testDir, "modules", "shared", "src", "storage", "AzureBlobStorage.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should replace template placeholders correctly", async () => {
      await command.run({ name: "Minio" });

      const filePath = join(testDir, "modules", "shared", "src", "storage", "MinioStorage.ts");
      const content = await Bun.file(filePath).text();

      expect(content).not.toContain("{{NAME}}");
      expect(content).not.toContain("{{NAME_UPPER}}");
      expect(content).toContain("Minio");
    });

    test("should include uppercase name variant in content", async () => {
      await command.run({ name: "DigitalOcean" });

      const filePath = join(testDir, "modules", "shared", "src", "storage", "DigitalOceanStorage.ts");
      const content = await Bun.file(filePath).text();

      expect(content).toContain("DIGITAL_OCEAN");
    });

    test("should replace MODULE placeholder in test file", async () => {
      await Bun.write(join(testDir, "modules", "user-profile", "src", "storage", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "user-profile", "tests", "storage", ".gitkeep"), "");

      await command.run({ name: "S3", module: "user-profile" });

      const testFilePath = join(testDir, "modules", "user-profile", "tests", "storage", "S3Storage.spec.ts");
      expect(existsSync(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).not.toContain("{{MODULE}}");
      expect(content).toContain("@module/user-profile/storage/S3StorageAdapter");
    });
  });
});
