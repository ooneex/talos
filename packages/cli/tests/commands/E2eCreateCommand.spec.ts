import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

const { E2eCreateCommand } = await import("@/commands/E2eCreateCommand");

describe("E2eCreateCommand", () => {
  let command: InstanceType<typeof E2eCreateCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    command = new E2eCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `e2e-${Date.now()}`);

    // Mock Bun.spawn to avoid running `bun add` / `bunx playwright install` in tests
    originalSpawn = Bun.spawn;
    Bun.spawn = ((...args: unknown[]) => {
      const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;
      if (Array.isArray(cmd) && (cmd[0] === "bun" || cmd[0] === "bunx")) {
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
      expect(command.getName()).toBe("e2e:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Generate a new Playwright e2e test");
    });
  });

  describe("run()", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "e2e", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should generate the spec file in the module e2e folder", async () => {
      await command.run({ name: "Home" });

      const filePath = join(testDir, "modules", "shared", "e2e", "Home.spec.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("import { test, expect } from '@playwright/test';");
      expect(content).toContain("has title");
    });

    test("should generate a playwright.config.ts in the module", async () => {
      await command.run({ name: "Home" });

      const configPath = join(testDir, "modules", "shared", "playwright.config.ts");
      expect(existsSync(configPath)).toBe(true);

      const content = await Bun.file(configPath).text();
      expect(content).toContain("testDir: './e2e'");
    });

    test("should strip a provided Spec suffix", async () => {
      await command.run({ name: "HomeSpec" });

      const filePath = join(testDir, "modules", "shared", "e2e", "Home.spec.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should add the e2e script to the module package.json when missing", async () => {
      const modulePackageJsonPath = join(testDir, "modules", "shared", "package.json");
      await Bun.write(
        modulePackageJsonPath,
        JSON.stringify({ name: "@module/shared", scripts: { test: "bun test tests" } }, null, 2),
      );

      await command.run({ name: "Home" });

      const packageJson = await Bun.file(modulePackageJsonPath).json();
      expect(packageJson.scripts.e2e).toBe("bunx playwright test");
      // Existing scripts are preserved.
      expect(packageJson.scripts.test).toBe("bun test tests");
    });

    test("should not override an existing e2e script", async () => {
      const modulePackageJsonPath = join(testDir, "modules", "shared", "package.json");
      await Bun.write(
        modulePackageJsonPath,
        JSON.stringify({ name: "@module/shared", scripts: { e2e: "custom command" } }, null, 2),
      );

      await command.run({ name: "Home" });

      const packageJson = await Bun.file(modulePackageJsonPath).json();
      expect(packageJson.scripts.e2e).toBe("custom command");
    });

    test("should install @playwright/test as a dev dependency", async () => {
      const commands: string[][] = [];
      Bun.spawn = ((...args: unknown[]) => {
        const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;
        if (Array.isArray(cmd)) commands.push(cmd as string[]);
        return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
      }) as typeof Bun.spawn;

      await command.run({ name: "Home" });

      expect(commands).toContainEqual(["bun", "add", "-d", "@playwright/test"]);
      expect(commands).toContainEqual(["bunx", "playwright", "install"]);
    });
  });
});
