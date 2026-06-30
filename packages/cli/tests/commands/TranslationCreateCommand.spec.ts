import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

const { TranslationCreateCommand } = await import("@/commands/TranslationCreateCommand");

describe("TranslationCreateCommand", () => {
  let command: InstanceType<typeof TranslationCreateCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    command = new TranslationCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `translation-${Date.now()}`);

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
      expect(command.getName()).toBe("translation:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Generate a new translation class");
    });
  });

  describe("run()", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "translations", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "translations", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should generate translation file with the Translation suffix", async () => {
      await command.run({ name: "Dashboard" });

      const filePath = join(testDir, "modules", "shared", "src", "translations", "DashboardTranslation.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("class DashboardTranslation extends Translation");
      expect(content).toContain('import dict from "./translations.yml"');
      expect(content).not.toContain("{{NAME}}");
    });

    test("should create a translations.yml dictionary in the same folder", async () => {
      await command.run({ name: "Dashboard" });

      const dictPath = join(testDir, "modules", "shared", "src", "translations", "translations.yml");
      expect(existsSync(dictPath)).toBe(true);

      const content = await Bun.file(dictPath).text();
      expect(content).toContain("welcome:");
      expect(content).toContain("items_plural:");
      expect(content).toContain("items_zero:");
    });

    test("should not override an existing translations.yml", async () => {
      const dictPath = join(testDir, "modules", "shared", "src", "translations", "translations.yml");
      await Bun.write(dictPath, "custom: true\n");

      await command.run({ name: "Dashboard" });

      const content = await Bun.file(dictPath).text();
      expect(content).toBe("custom: true\n");
    });

    test("should set the translation name to the snake_case of the class name", async () => {
      await command.run({ name: "Dashboard" });

      const filePath = join(testDir, "modules", "shared", "src", "translations", "DashboardTranslation.ts");
      const content = await Bun.file(filePath).text();
      expect(content).toContain('getName = (): string => "dashboard"');
      expect(content).not.toContain("{{SNAKE}}");
    });

    test("should generate a test file for the translation", async () => {
      await command.run({ name: "Dashboard" });

      const testFilePath = join(testDir, "modules", "shared", "tests", "translations", "DashboardTranslation.spec.ts");
      expect(existsSync(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).toContain("@module/shared/translations/DashboardTranslation");
    });

    test("should create a useLang hook when the target module is a spa", async () => {
      await Bun.write(join(testDir, "modules", "web", "package.json"), JSON.stringify({ name: "web" }));
      await Bun.write(join(testDir, "modules", "web", "web.yml"), 'type: "spa"\n');

      await command.run({ name: "Dashboard", module: "web" });

      const hookPath = join(testDir, "modules", "web", "src", "shared", "hooks", "useLang.ts");
      expect(existsSync(hookPath)).toBe(true);

      const content = await Bun.file(hookPath).text();
      expect(content).toContain("export const useLang");
      expect(content).toContain("useSearch({ strict: false })");
      expect(content).toContain('DEFAULT_LANG = "en"');
    });

    test("should not create a useLang hook for a non-spa module", async () => {
      await command.run({ name: "Dashboard" });

      const hookPath = join(testDir, "modules", "shared", "src", "shared", "hooks", "useLang.ts");
      expect(existsSync(hookPath)).toBe(false);
    });

    test("should create a translations.json dictionary for a spa module", async () => {
      await Bun.write(join(testDir, "modules", "web", "package.json"), JSON.stringify({ name: "web" }));
      await Bun.write(join(testDir, "modules", "web", "web.yml"), 'type: "spa"\n');

      await command.run({ name: "Dashboard", module: "web" });

      const jsonPath = join(
        testDir,
        "modules",
        "web",
        "src",
        "features",
        "dashboard",
        "translations",
        "translations.json",
      );
      const ymlPath = join(
        testDir,
        "modules",
        "web",
        "src",
        "features",
        "dashboard",
        "translations",
        "translations.yml",
      );
      expect(existsSync(jsonPath)).toBe(true);
      expect(existsSync(ymlPath)).toBe(false);

      const dict = JSON.parse(await Bun.file(jsonPath).text());
      expect(dict.welcome.en).toBe("Welcome, {{ name }}!");
      expect(dict.cart.items.en).toBe("{{ count }} item");
      expect(dict.cart.items_plural.en).toBe("{{ count }} items");
      expect(dict.cart.items_zero.en).toBe("No items");
    });

    test("should create a use<Name>Translate hook instead of a class for a spa module", async () => {
      await Bun.write(join(testDir, "modules", "web", "package.json"), JSON.stringify({ name: "web" }));
      await Bun.write(join(testDir, "modules", "web", "web.yml"), 'type: "spa"\n');

      await command.run({ name: "Dashboard", module: "web" });

      const hookPath = join(
        testDir,
        "modules",
        "web",
        "src",
        "features",
        "dashboard",
        "translations",
        "useDashboardTranslate.ts",
      );
      const classPath = join(
        testDir,
        "modules",
        "web",
        "src",
        "features",
        "dashboard",
        "translations",
        "DashboardTranslation.ts",
      );
      expect(existsSync(hookPath)).toBe(true);
      expect(existsSync(classPath)).toBe(false);

      const content = await Bun.file(hookPath).text();
      expect(content).toContain("export const useDashboardTranslate");
      expect(content).toContain('import { useLang } from "../../../shared/hooks/useLang"');
      expect(content).toContain('import dict from "./translations.json"');
      expect(content).toContain("trans, type TransDictType");
      expect(content).not.toContain("{{NAME}}");
    });

    test("should not create a translation class or test for a spa module", async () => {
      await Bun.write(join(testDir, "modules", "web", "package.json"), JSON.stringify({ name: "web" }));
      await Bun.write(join(testDir, "modules", "web", "web.yml"), 'type: "spa"\n');

      await command.run({ name: "Dashboard", module: "web" });

      const classPath = join(
        testDir,
        "modules",
        "web",
        "src",
        "features",
        "dashboard",
        "translations",
        "DashboardTranslation.ts",
      );
      const testPath = join(testDir, "modules", "web", "tests", "translations", "DashboardTranslation.spec.ts");
      expect(existsSync(classPath)).toBe(false);
      expect(existsSync(testPath)).toBe(false);
    });
  });
});
