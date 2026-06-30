import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import commitlintTemplate from "@/templates/app/.commitlintrc.ts.txt";
import moduleTemplate from "@/templates/module/module.txt";
import ymlTemplate from "@/templates/module/yml.txt";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

const { ModuleCreateCommand } = await import("@/commands/ModuleCreateCommand");

const exists = (path: string) => Bun.file(path).exists();

describe("ModuleCreateCommand", () => {
  let command: InstanceType<typeof ModuleCreateCommand>;
  let testDir: string;
  let originalCwd: string;
  beforeEach(() => {
    command = new ModuleCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `module-${Date.now()}`);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("module:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Generate a new module");
    });
  });

  describe("run()", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, ".gitkeep"), "");
    });

    test("should generate module directory structure", async () => {
      await command.run({ name: "User", cwd: testDir, silent: true });

      const moduleDir = join(testDir, "modules", "user", "src", "UserModule.ts");
      expect(await exists(moduleDir)).toBe(true);
    });

    test("should generate package.json", async () => {
      await command.run({ name: "User", cwd: testDir, silent: true });

      const filePath = join(testDir, "modules", "user", "package.json");
      expect(await exists(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("user");
    });

    test("should generate tsconfig.json", async () => {
      await command.run({ name: "User", cwd: testDir, silent: true });

      const filePath = join(testDir, "modules", "user", "tsconfig.json");
      expect(await exists(filePath)).toBe(true);
    });

    test("should generate module class file", async () => {
      await command.run({ name: "User", cwd: testDir, silent: true });

      const filePath = join(testDir, "modules", "user", "src", "UserModule.ts");
      expect(await exists(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("UserModule");
    });

    test("should generate test file", async () => {
      await command.run({ name: "User", cwd: testDir, silent: true });

      const filePath = join(testDir, "modules", "user", "tests", "UserModule.spec.ts");
      expect(await exists(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain('import { UserModule } from "@module/user/UserModule"');
    });

    test("should generate yml file in module root", async () => {
      await command.run({ name: "User", cwd: testDir, silent: true });

      const filePath = join(testDir, "modules", "user", "user.yml");
      expect(await exists(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toBe(ymlTemplate.replace(/{{name}}/g, "user"));
    });

    test("should generate yml file with kebab-case name", async () => {
      await command.run({ name: "UserProfile", cwd: testDir, silent: true });

      const filePath = join(testDir, "modules", "user-profile", "user-profile.yml");
      expect(await exists(filePath)).toBe(true);
    });

    test("should include type in yml file", async () => {
      await command.run({ name: "User", cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "modules", "user", "user.yml")).text();
      expect(content).toContain('type: "module"');
    });

    test("should normalize name to kebab-case for directory", async () => {
      await command.run({ name: "UserProfile", cwd: testDir, silent: true });

      const moduleDir = join(testDir, "modules", "user-profile", "src", "UserProfileModule.ts");
      expect(await exists(moduleDir)).toBe(true);
    });

    test("should normalize name to PascalCase for class", async () => {
      await command.run({ name: "user-profile", cwd: testDir, silent: true });

      const filePath = join(testDir, "modules", "user-profile", "src", "UserProfileModule.ts");
      expect(await exists(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("UserProfileModule");
    });

    test("should remove Module suffix if provided", async () => {
      await command.run({ name: "UserModule", cwd: testDir, silent: true });

      const filePath = join(testDir, "modules", "user", "src", "UserModule.ts");
      expect(await exists(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("UserModuleModule");
    });
  });

  describe("AppModule integration", () => {
    beforeEach(async () => {
      // Create an AppModule and root tsconfig
      const appModuleContent = moduleTemplate.replace(/{{NAME}}/g, "App");
      await Bun.write(join(testDir, "modules", "app", "src", "AppModule.ts"), appModuleContent);
      await Bun.write(join(testDir, "tsconfig.json"), JSON.stringify({ compilerOptions: {} }, null, 2));
    });

    test("should add import and spread into AppModule without entities", async () => {
      await command.run({ name: "Blog", cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "modules", "app", "src", "AppModule.ts")).text();
      expect(content).toContain('import { BlogModule } from "@module/blog/BlogModule"');
      expect(content).toContain("...BlogModule.controllers");
      expect(content).not.toContain("...BlogModule.entities");
      expect(content).toContain("...BlogModule.middlewares");
      expect(content).toContain("...BlogModule.cronJobs");
      expect(content).toContain("...BlogModule.events");
    });

    test("should add path alias to root tsconfig", async () => {
      await command.run({ name: "Blog", cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "tsconfig.json")).text();
      const tsconfig = JSON.parse(content);
      expect(tsconfig.compilerOptions.paths["@module/blog/*"]).toEqual(["./modules/blog/src/*"]);
    });

    test("should accumulate multiple modules in AppModule", async () => {
      await command.run({ name: "Blog", cwd: testDir, silent: true });
      await command.run({ name: "Shop", cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "modules", "app", "src", "AppModule.ts")).text();
      expect(content).toContain('import { BlogModule } from "@module/blog/BlogModule"');
      expect(content).toContain('import { ShopModule } from "@module/shop/ShopModule"');
      expect(content).toContain("...BlogModule.controllers");
      expect(content).toContain("...ShopModule.controllers");
    });

    test("should accumulate multiple path aliases in root tsconfig", async () => {
      await command.run({ name: "Blog", cwd: testDir, silent: true });
      await command.run({ name: "Shop", cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "tsconfig.json")).text();
      const tsconfig = JSON.parse(content);
      expect(tsconfig.compilerOptions.paths["@module/blog/*"]).toEqual(["./modules/blog/src/*"]);
      expect(tsconfig.compilerOptions.paths["@module/shop/*"]).toEqual(["./modules/shop/src/*"]);
    });

    test("should add path alias to root tsconfig even for app module", async () => {
      await command.run({ name: "App", cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "tsconfig.json")).text();
      const tsconfig = JSON.parse(content);
      expect(tsconfig.compilerOptions.paths["@module/app/*"]).toEqual(["./modules/app/src/*"]);
    });

    test("should register entities to SharedModule instead of AppModule", async () => {
      // Create shared module first
      await command.run({ name: "Shared", cwd: testDir, silent: true });
      await command.run({ name: "Blog", cwd: testDir, silent: true });

      const sharedContent = await Bun.file(join(testDir, "modules", "shared", "src", "SharedModule.ts")).text();
      expect(sharedContent).toContain('import { BlogModule } from "@module/blog/BlogModule"');
      expect(sharedContent).toContain("...BlogModule.entities");

      const appContent = await Bun.file(join(testDir, "modules", "app", "src", "AppModule.ts")).text();
      expect(appContent).not.toContain("...BlogModule.entities");
    });

    test("should accumulate entities from multiple modules in SharedModule", async () => {
      await command.run({ name: "Shared", cwd: testDir, silent: true });
      await command.run({ name: "Blog", cwd: testDir, silent: true });
      await command.run({ name: "Shop", cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "modules", "shared", "src", "SharedModule.ts")).text();
      expect(content).toContain("...BlogModule.entities");
      expect(content).toContain("...ShopModule.entities");
    });

    test("should not modify AppModule when creating app module", async () => {
      const originalContent = await Bun.file(join(testDir, "modules", "app", "src", "AppModule.ts")).text();

      await command.run({ name: "App", cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "modules", "app", "src", "AppModule.ts")).text();
      expect(content).toBe(originalContent);
    });
  });

  describe("Destination module", () => {
    beforeEach(async () => {
      // App + Shared modules used by the default `app` destination
      await Bun.write(
        join(testDir, "modules", "app", "src", "AppModule.ts"),
        moduleTemplate.replace(/{{NAME}}/g, "App"),
      );
      await Bun.write(
        join(testDir, "modules", "shared", "src", "SharedModule.ts"),
        moduleTemplate.replace(/{{NAME}}/g, "Shared"),
      );
      await Bun.write(join(testDir, "tsconfig.json"), JSON.stringify({ compilerOptions: {} }, null, 2));

      // A microservice module that can host other modules
      await Bun.write(
        join(testDir, "modules", "payment", "src", "PaymentModule.ts"),
        moduleTemplate.replace(/{{NAME}}/g, "Payment"),
      );
    });

    test("should register into AppModule and SharedModule for app destination", async () => {
      await command.run({ name: "Blog", destination: "app", cwd: testDir, silent: true });

      const appContent = await Bun.file(join(testDir, "modules", "app", "src", "AppModule.ts")).text();
      expect(appContent).toContain("...BlogModule.controllers");

      const sharedContent = await Bun.file(join(testDir, "modules", "shared", "src", "SharedModule.ts")).text();
      expect(sharedContent).toContain("...BlogModule.entities");

      const paymentContent = await Bun.file(join(testDir, "modules", "payment", "src", "PaymentModule.ts")).text();
      expect(paymentContent).not.toContain("BlogModule");
    });

    test("should register only into the selected destination module", async () => {
      await command.run({ name: "Blog", destination: "payment", cwd: testDir, silent: true });

      const paymentContent = await Bun.file(join(testDir, "modules", "payment", "src", "PaymentModule.ts")).text();
      expect(paymentContent).toContain('import { BlogModule } from "@module/blog/BlogModule"');
      expect(paymentContent).toContain("...BlogModule.controllers");
      expect(paymentContent).toContain("...BlogModule.entities");

      const appContent = await Bun.file(join(testDir, "modules", "app", "src", "AppModule.ts")).text();
      expect(appContent).not.toContain("BlogModule");

      const sharedContent = await Bun.file(join(testDir, "modules", "shared", "src", "SharedModule.ts")).text();
      expect(sharedContent).not.toContain("BlogModule");
    });

    test("should still add path alias regardless of destination", async () => {
      await command.run({ name: "Blog", destination: "payment", cwd: testDir, silent: true });

      const tsconfig = JSON.parse(await Bun.file(join(testDir, "tsconfig.json")).text());
      expect(tsconfig.compilerOptions.paths["@module/blog/*"]).toEqual(["./modules/blog/src/*"]);
    });
  });

  describe("Commitlint integration", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, ".commitlintrc.ts"), commitlintTemplate);
    });

    test("should add module scope to commitlint config", async () => {
      await command.run({ name: "Blog", cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, ".commitlintrc.ts")).text();
      expect(content).toContain('"blog"');
    });

    test("should accumulate multiple module scopes", async () => {
      await command.run({ name: "Blog", cwd: testDir, silent: true });
      await command.run({ name: "Shop", cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, ".commitlintrc.ts")).text();
      expect(content).toContain('"blog"');
      expect(content).toContain('"shop"');
    });

    test("should not duplicate existing scope", async () => {
      await command.run({ name: "Blog", cwd: testDir, silent: true });
      await command.run({ name: "Blog", cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, ".commitlintrc.ts")).text();
      const matches = content.match(/"blog"/g);
      expect(matches).toHaveLength(1);
    });

    test("should preserve existing scopes", async () => {
      await command.run({ name: "Blog", cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, ".commitlintrc.ts")).text();
      expect(content).toContain('"common"');
      expect(content).toContain('"app"');
    });

    test("should not modify commitlint config if file does not exist", async () => {
      rmSync(join(testDir, ".commitlintrc.ts"), { force: true });

      await command.run({ name: "Blog", cwd: testDir, silent: true });

      expect(await exists(join(testDir, ".commitlintrc.ts"))).toBe(false);
    });
  });
});
