import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

const { RateLimitCreateCommand } = await import("@/commands/RateLimitCreateCommand");

describe("RateLimitCreateCommand", () => {
  let command: InstanceType<typeof RateLimitCreateCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    command = new RateLimitCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `rate-limit-${Date.now()}`);

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
      expect(command.getName()).toBe("rate-limit:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Generate a new rate limiter class");
    });
  });

  describe("override option", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "rate-limit", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "rate-limit", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should override existing file when override option is passed", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "rate-limit", "LoginRateLimiter.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "Login", override: true });

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("// existing content");
      expect(content).toContain("Login");
    });

    test("should not override existing file when prompt is declined", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "rate-limit", "LoginRateLimiter.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "Login" });

      const content = await Bun.file(filePath).text();
      expect(content).toBe("// existing content");
    });
  });

  describe("run()", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "rate-limit", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "rate-limit", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should generate rate limiter file with correct name", async () => {
      await command.run({ name: "Login" });

      const filePath = join(testDir, "modules", "shared", "src", "rate-limit", "LoginRateLimiter.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("LoginRateLimiter");
    });

    test("should generate test file for rate limiter", async () => {
      await command.run({ name: "Login" });

      const testFilePath = join(testDir, "modules", "shared", "tests", "rate-limit", "LoginRateLimiter.spec.ts");
      expect(existsSync(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).toContain("LoginRateLimiter");
    });

    test("should normalize name with toPascalCase", async () => {
      await command.run({ name: "auth-api" });

      const filePath = join(testDir, "modules", "shared", "src", "rate-limit", "AuthApiRateLimiter.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should remove RateLimiter suffix if provided", async () => {
      await command.run({ name: "LoginRateLimiter" });

      const filePath = join(testDir, "modules", "shared", "src", "rate-limit", "LoginRateLimiter.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("LoginRateLimiterRateLimiter");
    });

    test("should remove RateLimit suffix if provided", async () => {
      await command.run({ name: "LoginRateLimit" });

      const filePath = join(testDir, "modules", "shared", "src", "rate-limit", "LoginRateLimiter.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("LoginRateLimitRateLimiter");
    });

    test("should replace template placeholders correctly", async () => {
      await command.run({ name: "Login" });

      const filePath = join(testDir, "modules", "shared", "src", "rate-limit", "LoginRateLimiter.ts");
      const content = await Bun.file(filePath).text();

      expect(content).not.toContain("{{NAME}}");
      expect(content).toContain("Login");
    });

    test("should replace MODULE placeholder in test file", async () => {
      await Bun.write(join(testDir, "modules", "user-profile", "src", "rate-limit", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "user-profile", "tests", "rate-limit", ".gitkeep"), "");

      await command.run({ name: "Login", module: "user-profile" });

      const testFilePath = join(testDir, "modules", "user-profile", "tests", "rate-limit", "LoginRateLimiter.spec.ts");
      expect(existsSync(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).not.toContain("{{MODULE}}");
      expect(content).toContain("@module/user-profile/rate-limit/LoginRateLimiter");
    });
  });
});
