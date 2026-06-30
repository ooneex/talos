import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

const { CacheCreateCommand } = await import("@/commands/CacheCreateCommand");

describe("CacheCreateCommand", () => {
  let command: InstanceType<typeof CacheCreateCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    command = new CacheCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `cache-${Date.now()}`);

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
      expect(command.getName()).toBe("cache:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Generate a new cache class");
    });
  });

  describe("override option", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "cache", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "cache", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should override existing file when override option is passed", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "cache", "UserCache.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "User", override: true });

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("// existing content");
      expect(content).toContain("User");
    });

    test("should not override existing file when prompt is declined", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "cache", "UserCache.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "User" });

      const content = await Bun.file(filePath).text();
      expect(content).toBe("// existing content");
    });
  });

  describe("run()", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "cache", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "cache", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should generate cache file with correct name", async () => {
      await command.run({ name: "Redis" });

      const filePath = join(testDir, "modules", "shared", "src", "cache", "RedisCache.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("RedisCache");
    });

    test("should generate test file for cache", async () => {
      await command.run({ name: "Redis" });

      const testFilePath = join(testDir, "modules", "shared", "tests", "cache", "RedisCache.spec.ts");
      expect(existsSync(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).toContain("RedisCache");
    });

    test("should normalize name with toPascalCase", async () => {
      await command.run({ name: "in-memory" });

      const filePath = join(testDir, "modules", "shared", "src", "cache", "InMemoryCache.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should remove Cache suffix if provided", async () => {
      await command.run({ name: "RedisCache" });

      const filePath = join(testDir, "modules", "shared", "src", "cache", "RedisCache.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("RedisCacheCache");
    });

    test("should handle lowercase input", async () => {
      await command.run({ name: "memcached" });

      const filePath = join(testDir, "modules", "shared", "src", "cache", "MemcachedCache.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should handle snake_case input", async () => {
      await command.run({ name: "file_system" });

      const filePath = join(testDir, "modules", "shared", "src", "cache", "FileSystemCache.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should replace template placeholders correctly", async () => {
      await command.run({ name: "Memory" });

      const filePath = join(testDir, "modules", "shared", "src", "cache", "MemoryCache.ts");
      const content = await Bun.file(filePath).text();

      expect(content).not.toContain("{{NAME}}");
      expect(content).toContain("Memory");
    });

    test("should replace MODULE placeholder in test file", async () => {
      await Bun.write(join(testDir, "modules", "user-profile", "src", "cache", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "user-profile", "tests", "cache", ".gitkeep"), "");

      await command.run({ name: "Redis", module: "user-profile" });

      const testFilePath = join(testDir, "modules", "user-profile", "tests", "cache", "RedisCache.spec.ts");
      expect(existsSync(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).not.toContain("{{MODULE}}");
      expect(content).toContain("@module/user-profile/cache/RedisCache");
    });
  });
});
