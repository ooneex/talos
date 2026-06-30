import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

const { FeatureFlagCreateCommand } = await import("@/commands/FeatureFlagCreateCommand");

describe("FeatureFlagCreateCommand", () => {
  let command: InstanceType<typeof FeatureFlagCreateCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    command = new FeatureFlagCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `feature-flag-${Date.now()}`);

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
      expect(command.getName()).toBe("flag:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Generate a new feature flag class");
    });
  });

  describe("override option", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "flags", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "feature-flag", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should override existing file when override option is passed", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "flags", "UserFeatureFlag.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "User", override: true });

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("// existing content");
      expect(content).toContain("User");
    });

    test("should not override existing file when prompt is declined", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "flags", "UserFeatureFlag.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "User" });

      const content = await Bun.file(filePath).text();
      expect(content).toBe("// existing content");
    });
  });

  describe("run()", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "flags", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "feature-flag", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should generate feature flag file with correct name", async () => {
      await command.run({ name: "DarkMode" });

      const filePath = join(testDir, "modules", "shared", "src", "flags", "DarkModeFeatureFlag.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("DarkModeFeatureFlag");
    });

    test("should generate test file for feature flag", async () => {
      await command.run({ name: "DarkMode" });

      const testFilePath = join(testDir, "modules", "shared", "tests", "feature-flag", "DarkModeFeatureFlag.spec.ts");
      expect(existsSync(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).toContain("DarkModeFeatureFlag");
    });

    test("should normalize name with toPascalCase", async () => {
      await command.run({ name: "new-checkout" });

      const filePath = join(testDir, "modules", "shared", "src", "flags", "NewCheckoutFeatureFlag.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should remove FeatureFlag suffix if provided", async () => {
      await command.run({ name: "DarkModeFeatureFlag" });

      const filePath = join(testDir, "modules", "shared", "src", "flags", "DarkModeFeatureFlag.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("DarkModeFeatureFlagFeatureFlag");
    });

    test("should handle lowercase input", async () => {
      await command.run({ name: "beta" });

      const filePath = join(testDir, "modules", "shared", "src", "flags", "BetaFeatureFlag.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should handle snake_case input", async () => {
      await command.run({ name: "new_dashboard" });

      const filePath = join(testDir, "modules", "shared", "src", "flags", "NewDashboardFeatureFlag.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should replace template placeholders correctly", async () => {
      await command.run({ name: "DarkMode" });

      const filePath = join(testDir, "modules", "shared", "src", "flags", "DarkModeFeatureFlag.ts");
      const content = await Bun.file(filePath).text();

      expect(content).not.toContain("{{NAME}}");
      expect(content).not.toContain("{{KEY}}");
      expect(content).toContain("DarkMode");
    });

    test("should seed the key with the kebab-cased name", async () => {
      await command.run({ name: "NewCheckout" });

      const filePath = join(testDir, "modules", "shared", "src", "flags", "NewCheckoutFeatureFlag.ts");
      const content = await Bun.file(filePath).text();

      expect(content).toContain('return "new-checkout";');
    });

    test("should replace MODULE placeholder in test file", async () => {
      await Bun.write(join(testDir, "modules", "user-profile", "src", "flags", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "user-profile", "tests", "feature-flag", ".gitkeep"), "");

      await command.run({ name: "DarkMode", module: "user-profile" });

      const testFilePath = join(
        testDir,
        "modules",
        "user-profile",
        "tests",
        "feature-flag",
        "DarkModeFeatureFlag.spec.ts",
      );
      expect(existsSync(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).not.toContain("{{MODULE}}");
      expect(content).toContain("@module/user-profile/feature-flag/DarkModeFeatureFlag");
    });
  });
});
