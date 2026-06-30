import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import moduleTemplate from "@/templates/module/module.txt";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

const { MiddlewareCreateCommand } = await import("@/commands/MiddlewareCreateCommand");

const exists = (path: string) => Bun.file(path).exists();

describe("MiddlewareCreateCommand", () => {
  let command: InstanceType<typeof MiddlewareCreateCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    command = new MiddlewareCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `middleware-${Date.now()}`);

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
      expect(command.getName()).toBe("middleware:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Generate a new middleware class");
    });
  });

  describe("override option", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "middlewares", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "middlewares", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should override existing file when override option is passed", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "middlewares", "AuthMiddleware.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "Auth", isSocket: false, override: true });

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("// existing content");
      expect(content).toContain("Auth");
    });

    test("should not override existing file when prompt is declined", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "middlewares", "AuthMiddleware.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "Auth", isSocket: false });

      const content = await Bun.file(filePath).text();
      expect(content).toBe("// existing content");
    });
  });

  describe("run() with HTTP middleware", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "middlewares", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "middlewares", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should generate middleware file with correct name", async () => {
      await command.run({ name: "Auth", isSocket: false });

      const filePath = join(testDir, "modules", "shared", "src", "middlewares", "AuthMiddleware.ts");
      expect(await exists(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("AuthMiddleware");
    });

    test("should generate test file for middleware", async () => {
      await command.run({ name: "Auth", isSocket: false });

      const testFilePath = join(testDir, "modules", "shared", "tests", "middlewares", "AuthMiddleware.spec.ts");
      expect(await exists(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).toContain("AuthMiddleware");
    });

    test("should normalize name with toPascalCase", async () => {
      await command.run({ name: "rate-limiter", isSocket: false });

      const filePath = join(testDir, "modules", "shared", "src", "middlewares", "RateLimiterMiddleware.ts");
      expect(await exists(filePath)).toBe(true);
    });

    test("should remove Middleware suffix if provided", async () => {
      await command.run({ name: "AuthMiddleware", isSocket: false });

      const filePath = join(testDir, "modules", "shared", "src", "middlewares", "AuthMiddleware.ts");
      expect(await exists(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("AuthMiddlewareMiddleware");
    });

    test("should handle lowercase input", async () => {
      await command.run({ name: "cors", isSocket: false });

      const filePath = join(testDir, "modules", "shared", "src", "middlewares", "CorsMiddleware.ts");
      expect(await exists(filePath)).toBe(true);
    });

    test("should handle snake_case input", async () => {
      await command.run({ name: "request_logger", isSocket: false });

      const filePath = join(testDir, "modules", "shared", "src", "middlewares", "RequestLoggerMiddleware.ts");
      expect(await exists(filePath)).toBe(true);
    });

    test("should replace template placeholders correctly", async () => {
      await command.run({ name: "Security", isSocket: false });

      const filePath = join(testDir, "modules", "shared", "src", "middlewares", "SecurityMiddleware.ts");
      const content = await Bun.file(filePath).text();

      expect(content).not.toContain("{{NAME}}");
      expect(content).toContain("Security");
    });

    test("should replace MODULE placeholder in test file", async () => {
      await Bun.write(join(testDir, "modules", "user-profile", "src", "middlewares", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "user-profile", "tests", "middlewares", ".gitkeep"), "");

      await command.run({ name: "Auth", module: "user-profile", isSocket: false });

      const testFilePath = join(testDir, "modules", "user-profile", "tests", "middlewares", "AuthMiddleware.spec.ts");
      expect(await exists(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).not.toContain("{{MODULE}}");
      expect(content).toContain("@module/user-profile/middlewares/AuthMiddleware");
    });
  });

  describe("run() with Socket middleware", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "middlewares", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "middlewares", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should generate socket middleware file", async () => {
      await command.run({ name: "SocketAuth", isSocket: true });

      const filePath = join(testDir, "modules", "shared", "src", "middlewares", "SocketAuthMiddleware.ts");
      expect(await exists(filePath)).toBe(true);
    });

    test("should generate test file for socket middleware", async () => {
      await command.run({ name: "SocketAuth", isSocket: true });

      const testFilePath = join(testDir, "modules", "shared", "tests", "middlewares", "SocketAuthMiddleware.spec.ts");
      expect(await exists(testFilePath)).toBe(true);
    });

    test("should use socket template for socket middleware", async () => {
      await command.run({ name: "Connection", isSocket: true });

      const filePath = join(testDir, "modules", "shared", "src", "middlewares", "ConnectionMiddleware.ts");
      const content = await Bun.file(filePath).text();
      expect(content).toContain("ConnectionMiddleware");
    });
  });

  describe("Module integration (default shared module)", () => {
    beforeEach(async () => {
      const moduleContent = moduleTemplate.replace(/{{NAME}}/g, "Shared");
      await Bun.write(join(testDir, "modules", "shared", "src", "SharedModule.ts"), moduleContent);
      await Bun.write(join(testDir, "modules", "shared", "src", "middlewares", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "middlewares", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should add import and class to module middlewares array", async () => {
      await command.run({ name: "Auth", isSocket: false });

      const content = await Bun.file(join(testDir, "modules", "shared", "src", "SharedModule.ts")).text();
      expect(content).toContain('import { AuthMiddleware } from "./middlewares/AuthMiddleware"');
      expect(content).toMatch(/middlewares:\s*\[.*AuthMiddleware.*\]/s);
    });

    test("should accumulate multiple middlewares in module", async () => {
      await command.run({ name: "Auth", isSocket: false });
      await command.run({ name: "Logger", isSocket: false });

      const content = await Bun.file(join(testDir, "modules", "shared", "src", "SharedModule.ts")).text();
      expect(content).toContain('import { AuthMiddleware } from "./middlewares/AuthMiddleware"');
      expect(content).toContain('import { LoggerMiddleware } from "./middlewares/LoggerMiddleware"');
      expect(content).toMatch(/middlewares:\s*\[.*AuthMiddleware.*LoggerMiddleware.*\]/s);
    });
  });

  describe("Module integration (with module parameter)", () => {
    beforeEach(async () => {
      testDir = join(originalCwd, ".temp", `middleware-module-${Date.now()}`);
      const moduleContent = moduleTemplate.replace(/{{NAME}}/g, "Blog");
      await Bun.write(join(testDir, "modules", "blog", "src", "BlogModule.ts"), moduleContent);
      await Bun.write(join(testDir, "modules", "blog", "src", "middlewares", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "blog", "tests", "middlewares", ".gitkeep"), "");
      await Bun.write(
        join(testDir, "modules", "blog", "package.json"),
        JSON.stringify({ name: "@module/blog" }, null, 2),
      );
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should generate files under modules directory", async () => {
      await command.run({ name: "Auth", module: "blog", isSocket: false });

      const middlewarePath = join(testDir, "modules", "blog", "src", "middlewares", "AuthMiddleware.ts");
      expect(await exists(middlewarePath)).toBe(true);

      const testFilePath = join(testDir, "modules", "blog", "tests", "middlewares", "AuthMiddleware.spec.ts");
      expect(await exists(testFilePath)).toBe(true);
    });

    test("should add import and class to module middlewares array", async () => {
      await command.run({ name: "Auth", module: "blog", isSocket: false });

      const content = await Bun.file(join(testDir, "modules", "blog", "src", "BlogModule.ts")).text();
      expect(content).toContain('import { AuthMiddleware } from "./middlewares/AuthMiddleware"');
      expect(content).toMatch(/middlewares:\s*\[.*AuthMiddleware.*\]/s);
    });

    test("should accumulate multiple middlewares in module", async () => {
      await command.run({ name: "Auth", module: "blog", isSocket: false });
      await command.run({ name: "Logger", module: "blog", isSocket: false });

      const content = await Bun.file(join(testDir, "modules", "blog", "src", "BlogModule.ts")).text();
      expect(content).toContain('import { AuthMiddleware } from "./middlewares/AuthMiddleware"');
      expect(content).toContain('import { LoggerMiddleware } from "./middlewares/LoggerMiddleware"');
      expect(content).toMatch(/middlewares:\s*\[.*AuthMiddleware.*LoggerMiddleware.*\]/s);
    });
  });
});
