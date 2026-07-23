import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import moduleTemplate from "@/templates/module/module.txt";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Spa", confirm: true })),
}));

const { SpaCreateCommand } = await import("@/commands/SpaCreateCommand");
const { SpaRemoveCommand } = await import("@/commands/SpaRemoveCommand");
const { ModuleCreateCommand } = await import("@/commands/ModuleCreateCommand");

const exists = (path: string) => Bun.file(path).exists();

describe("SpaRemoveCommand", () => {
  let makeCommand: InstanceType<typeof SpaCreateCommand>;
  let removeCommand: InstanceType<typeof SpaRemoveCommand>;
  let moduleCommand: InstanceType<typeof ModuleCreateCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    makeCommand = new SpaCreateCommand();
    removeCommand = new SpaRemoveCommand();
    moduleCommand = new ModuleCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `remove-spa-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    // Stub Bun.spawn so "git clone" materializes a fake repository and "bun add" is a no-op
    originalSpawn = Bun.spawn;
    Bun.spawn = ((...args: unknown[]) => {
      const cmd = args[0] as string[];

      if (cmd[0] === "git" && cmd[1] === "clone") {
        const dest = cmd[cmd.length - 1] as string;
        const templateDir = join(dest, "modules", "spa");
        mkdirSync(join(templateDir, "src"), { recursive: true });
        writeFileSync(join(templateDir, "src", "App.tsx"), "export const App = () => null;\n");
        writeFileSync(join(templateDir, "package.json"), JSON.stringify({ dependencies: {}, devDependencies: {} }));
      }

      return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
    }) as typeof Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
    process.chdir(originalCwd);
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(removeCommand.getName()).toBe("spa:remove");
    });

    test("should return correct description", () => {
      expect(removeCommand.getDescription()).toBe("Remove an existing spa module");
    });
  });

  describe("run()", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, ".gitkeep"), "");
    });

    test("should remove spa module directory", async () => {
      await makeCommand.run({ name: "Spa", cwd: testDir, silent: true });
      expect(await exists(join(testDir, "modules", "spa", "package.json"))).toBe(true);

      await removeCommand.run({ name: "Spa", cwd: testDir, silent: true });
      expect(await exists(join(testDir, "modules", "spa", "package.json"))).toBe(false);
    });

    test("should not fail when spa module does not exist", async () => {
      await removeCommand.run({ name: "NonExistent", cwd: testDir, silent: true });
    });

    test("should not remove app module", async () => {
      await moduleCommand.run({ name: "App", cwd: testDir, silent: true });

      await removeCommand.run({ name: "App", cwd: testDir, silent: true });
      expect(await exists(join(testDir, "modules", "app", "package.json"))).toBe(true);
    });

    test("should not remove shared module", async () => {
      await moduleCommand.run({ name: "Shared", cwd: testDir, silent: true });

      await removeCommand.run({ name: "Shared", cwd: testDir, silent: true });
      expect(await exists(join(testDir, "modules", "shared", "package.json"))).toBe(true);
    });

    test("should not remove a non-spa module", async () => {
      await moduleCommand.run({ name: "Blog", cwd: testDir, silent: true });

      await removeCommand.run({ name: "Blog", cwd: testDir, silent: true });
      expect(await exists(join(testDir, "modules", "blog", "package.json"))).toBe(true);
    });

    test("should normalize name to kebab-case", async () => {
      await makeCommand.run({ name: "SpaDashboard", cwd: testDir, silent: true });

      await removeCommand.run({ name: "SpaDashboard", cwd: testDir, silent: true });
      expect(await exists(join(testDir, "modules", "spa-dashboard", "package.json"))).toBe(false);
    });

    test("should handle Module suffix in name", async () => {
      await makeCommand.run({ name: "SpaModule", cwd: testDir, silent: true });

      await removeCommand.run({ name: "SpaModule", cwd: testDir, silent: true });
      expect(await exists(join(testDir, "modules", "spa", "package.json"))).toBe(false);
    });
  });

  describe("tsconfig integration", () => {
    beforeEach(async () => {
      const appModuleContent = moduleTemplate.replace(/{{NAME}}/g, "App");
      await Bun.write(join(testDir, "modules", "app", "src", "AppModule.ts"), appModuleContent);
      await Bun.write(join(testDir, "tsconfig.json"), JSON.stringify({ compilerOptions: {} }, null, 2));
    });

    test("should remove path alias from root tsconfig", async () => {
      await makeCommand.run({ name: "Spa", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Spa", cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "tsconfig.json")).text();
      const tsconfig = JSON.parse(content);
      expect(tsconfig.compilerOptions.paths?.["@module/spa/*"]).toBeUndefined();
    });
  });
});
