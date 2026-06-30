import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

const { RepositoryCreateCommand } = await import("@/commands/RepositoryCreateCommand");

describe("RepositoryCreateCommand", () => {
  let command: InstanceType<typeof RepositoryCreateCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    command = new RepositoryCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `repository-${Date.now()}`);

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
      expect(command.getName()).toBe("repository:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Generate a new repository class");
    });
  });

  describe("override option", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "repositories", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "repositories", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should override existing file when override option is passed", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "repositories", "UserRepository.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "User", override: true });

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("// existing content");
      expect(content).toContain("User");
    });

    test("should not override existing file when prompt is declined", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "repositories", "UserRepository.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "User" });

      const content = await Bun.file(filePath).text();
      expect(content).toBe("// existing content");
    });
  });

  describe("run()", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "repositories", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "repositories", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should generate repository file with correct name", async () => {
      await command.run({ name: "User" });

      const filePath = join(testDir, "modules", "shared", "src", "repositories", "UserRepository.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("UserRepository");
    });

    test("should generate test file for repository", async () => {
      await command.run({ name: "User" });

      const testFilePath = join(testDir, "modules", "shared", "tests", "repositories", "UserRepository.spec.ts");
      expect(existsSync(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).toContain("UserRepository");
    });

    test("should normalize name with toPascalCase", async () => {
      await command.run({ name: "user-profile" });

      const filePath = join(testDir, "modules", "shared", "src", "repositories", "UserProfileRepository.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should install the dependency silently without inheriting output", async () => {
      const installCalls: { cmd: string[]; stderr: unknown }[] = [];
      Bun.spawn = ((...args: unknown[]) => {
        const cmd = Array.isArray(args[0]) ? (args[0] as string[]) : (args[0] as { cmd?: string[] })?.cmd;
        const opts = args[1] as { stderr?: unknown } | undefined;
        if (Array.isArray(cmd) && cmd[0] === "bun" && cmd[1] === "add") {
          installCalls.push({ cmd: [...cmd], stderr: opts?.stderr });
          return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
        }
        return originalSpawn.apply(Bun, args as Parameters<typeof Bun.spawn>);
      }) as typeof Bun.spawn;

      await command.run({ name: "User" });

      expect(installCalls.length).toBeGreaterThan(0);
      expect(installCalls[0]?.stderr).toBe("ignore");
    });

    test("should remove Repository suffix if provided", async () => {
      await command.run({ name: "UserRepository" });

      const filePath = join(testDir, "modules", "shared", "src", "repositories", "UserRepository.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("UserRepositoryRepository");
    });

    test("should handle lowercase input", async () => {
      await command.run({ name: "product" });

      const filePath = join(testDir, "modules", "shared", "src", "repositories", "ProductRepository.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should handle snake_case input", async () => {
      await command.run({ name: "order_item" });

      const filePath = join(testDir, "modules", "shared", "src", "repositories", "OrderItemRepository.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should replace template placeholders correctly", async () => {
      await command.run({ name: "Book" });

      const filePath = join(testDir, "modules", "shared", "src", "repositories", "BookRepository.ts");
      const content = await Bun.file(filePath).text();

      expect(content).not.toContain("{{NAME}}");
      expect(content).toContain("Book");
    });

    test("should replace MODULE placeholder in test file", async () => {
      await Bun.write(join(testDir, "modules", "user-profile", "src", "repositories", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "user-profile", "tests", "repositories", ".gitkeep"), "");

      await command.run({ name: "User", module: "user-profile" });

      const testFilePath = join(testDir, "modules", "user-profile", "tests", "repositories", "UserRepository.spec.ts");
      expect(existsSync(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).not.toContain("{{MODULE}}");
      expect(content).toContain("@module/user-profile/repositories/UserRepository");
    });
  });
});
