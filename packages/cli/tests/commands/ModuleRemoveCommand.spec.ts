import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import commitlintTemplate from "@/templates/app/.commitlintrc.ts.txt";
import moduleTemplate from "@/templates/module/module.txt";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test", confirm: true })),
}));

const { ModuleCreateCommand } = await import("@/commands/ModuleCreateCommand");
const { ModuleRemoveCommand } = await import("@/commands/ModuleRemoveCommand");

const exists = (path: string) => Bun.file(path).exists();

describe("ModuleRemoveCommand", () => {
  let makeCommand: InstanceType<typeof ModuleCreateCommand>;
  let removeCommand: InstanceType<typeof ModuleRemoveCommand>;
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    makeCommand = new ModuleCreateCommand();
    removeCommand = new ModuleRemoveCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `remove-module-${Date.now()}`);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(removeCommand.getName()).toBe("module:remove");
    });

    test("should return correct description", () => {
      expect(removeCommand.getDescription()).toBe("Remove an existing module");
    });
  });

  describe("run()", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, ".gitkeep"), "");
    });

    test("should remove module directory", async () => {
      await makeCommand.run({ name: "Blog", cwd: testDir, silent: true });
      expect(await exists(join(testDir, "modules", "blog", "package.json"))).toBe(true);

      await removeCommand.run({ name: "Blog", cwd: testDir, silent: true });
      expect(await exists(join(testDir, "modules", "blog", "package.json"))).toBe(false);
    });

    test("should not fail when module does not exist", async () => {
      await removeCommand.run({ name: "NonExistent", cwd: testDir, silent: true });
    });

    test("should not remove app module", async () => {
      await makeCommand.run({ name: "App", cwd: testDir, silent: true });

      await removeCommand.run({ name: "App", cwd: testDir, silent: true });
      expect(await exists(join(testDir, "modules", "app", "package.json"))).toBe(true);
    });

    test("should not remove shared module", async () => {
      await makeCommand.run({ name: "Shared", cwd: testDir, silent: true });

      await removeCommand.run({ name: "Shared", cwd: testDir, silent: true });
      expect(await exists(join(testDir, "modules", "shared", "package.json"))).toBe(true);
    });

    test("should normalize name to kebab-case", async () => {
      await makeCommand.run({ name: "UserProfile", cwd: testDir, silent: true });

      await removeCommand.run({ name: "UserProfile", cwd: testDir, silent: true });
      expect(await exists(join(testDir, "modules", "user-profile", "package.json"))).toBe(false);
    });

    test("should handle Module suffix in name", async () => {
      await makeCommand.run({ name: "BlogModule", cwd: testDir, silent: true });

      await removeCommand.run({ name: "BlogModule", cwd: testDir, silent: true });
      expect(await exists(join(testDir, "modules", "blog", "package.json"))).toBe(false);
    });
  });

  describe("AppModule integration", () => {
    beforeEach(async () => {
      const appModuleContent = moduleTemplate.replace(/{{NAME}}/g, "App");
      await Bun.write(join(testDir, "modules", "app", "src", "AppModule.ts"), appModuleContent);
      await Bun.write(join(testDir, "tsconfig.json"), JSON.stringify({ compilerOptions: {} }, null, 2));
    });

    test("should remove import and spreads from AppModule", async () => {
      await makeCommand.run({ name: "Blog", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Blog", cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "modules", "app", "src", "AppModule.ts")).text();
      expect(content).not.toContain("BlogModule");
      expect(content).not.toContain("@module/blog");
    });

    test("should remove path alias from root tsconfig", async () => {
      await makeCommand.run({ name: "Blog", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Blog", cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "tsconfig.json")).text();
      const tsconfig = JSON.parse(content);
      expect(tsconfig.compilerOptions.paths?.["@module/blog/*"]).toBeUndefined();
    });

    test("should preserve other modules when removing one", async () => {
      await makeCommand.run({ name: "Blog", cwd: testDir, silent: true });
      await makeCommand.run({ name: "Shop", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Blog", cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "modules", "app", "src", "AppModule.ts")).text();
      expect(content).not.toContain("BlogModule");
      expect(content).toContain('import { ShopModule } from "@module/shop/ShopModule"');
      expect(content).toContain("...ShopModule.controllers");
      expect(content).toContain("...ShopModule.middlewares");
      expect(content).toContain("...ShopModule.cronJobs");
      expect(content).toContain("...ShopModule.events");
    });

    test("should preserve other path aliases when removing one", async () => {
      await makeCommand.run({ name: "Blog", cwd: testDir, silent: true });
      await makeCommand.run({ name: "Shop", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Blog", cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "tsconfig.json")).text();
      const tsconfig = JSON.parse(content);
      expect(tsconfig.compilerOptions.paths?.["@module/blog/*"]).toBeUndefined();
      expect(tsconfig.compilerOptions.paths["@module/shop/*"]).toEqual(["./modules/shop/src/*"]);
    });
  });

  describe("SharedModule integration", () => {
    beforeEach(async () => {
      const appModuleContent = moduleTemplate.replace(/{{NAME}}/g, "App");
      await Bun.write(join(testDir, "modules", "app", "src", "AppModule.ts"), appModuleContent);
      await Bun.write(join(testDir, "tsconfig.json"), JSON.stringify({ compilerOptions: {} }, null, 2));
    });

    test("should remove entities from SharedModule", async () => {
      await makeCommand.run({ name: "Shared", cwd: testDir, silent: true });
      await makeCommand.run({ name: "Blog", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Blog", cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "modules", "shared", "src", "SharedModule.ts")).text();
      expect(content).not.toContain("BlogModule");
      expect(content).not.toContain("@module/blog");
    });

    test("should preserve other module entities in SharedModule", async () => {
      await makeCommand.run({ name: "Shared", cwd: testDir, silent: true });
      await makeCommand.run({ name: "Blog", cwd: testDir, silent: true });
      await makeCommand.run({ name: "Shop", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Blog", cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "modules", "shared", "src", "SharedModule.ts")).text();
      expect(content).not.toContain("BlogModule");
      expect(content).toContain('import { ShopModule } from "@module/shop/ShopModule"');
      expect(content).toContain("...ShopModule.entities");
    });
  });

  describe("Commitlint integration", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, ".commitlintrc.ts"), commitlintTemplate);
    });

    test("should remove module scope from commitlint config", async () => {
      await makeCommand.run({ name: "Blog", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Blog", cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, ".commitlintrc.ts")).text();
      expect(content).not.toContain('"blog"');
    });

    test("should preserve other scopes when removing one", async () => {
      await makeCommand.run({ name: "Blog", cwd: testDir, silent: true });
      await makeCommand.run({ name: "Shop", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Blog", cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, ".commitlintrc.ts")).text();
      expect(content).not.toContain('"blog"');
      expect(content).toContain('"shop"');
    });

    test("should preserve default scopes", async () => {
      await makeCommand.run({ name: "Blog", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Blog", cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, ".commitlintrc.ts")).text();
      expect(content).toContain('"common"');
      expect(content).toContain('"app"');
    });

    test("should not fail when commitlint config does not exist", async () => {
      rmSync(join(testDir, ".commitlintrc.ts"), { force: true });
      await makeCommand.run({ name: "Blog", cwd: testDir, silent: true });

      await removeCommand.run({ name: "Blog", cwd: testDir, silent: true });
    });
  });
});
