import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import moduleTemplate from "@/templates/module/module.txt";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

const { DesignCreateCommand } = await import("@/commands/DesignCreateCommand");

const exists = (path: string) => Bun.file(path).exists();
const read = (path: string) => Bun.file(path).text();

// Source files and dependencies the mocked clone of the design repository exposes
const DESIGN_SRC_FILE = "Button.tsx";
const DESIGN_SRC_CONTENT = "export const Button = () => null;\n";
const DESIGN_DEPENDENCIES = { react: "^18.0.0" };
const DESIGN_DEV_DEPENDENCIES = { typescript: "^5.0.0" };

describe("DesignCreateCommand", () => {
  let command: InstanceType<typeof DesignCreateCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;
  let originalWhich: typeof Bun.which;
  let spawnCalls: { cmd: string[]; cwd: string; stderr?: unknown }[];

  beforeEach(() => {
    command = new DesignCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `design-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    spawnCalls = [];

    // Pretend `git` is installed so tests never depend on the host PATH; the
    // missing-binary case is exercised explicitly below.
    originalWhich = Bun.which;
    Bun.which = (() => "/usr/bin/git") as typeof Bun.which;

    // Stub Bun.spawn so "git clone" materializes a fake repository and "bun add" is a no-op
    originalSpawn = Bun.spawn;
    Bun.spawn = ((...args: unknown[]) => {
      const cmd = args[0] as string[];
      const opts = args[1] as { cwd?: string; stderr?: unknown } | undefined;
      spawnCalls.push({ cmd: [...cmd], cwd: opts?.cwd ?? "", stderr: opts?.stderr });

      if (cmd[0] === "git" && cmd[1] === "clone") {
        const dest = cmd[cmd.length - 1] as string;
        mkdirSync(join(dest, "src"), { recursive: true });
        writeFileSync(join(dest, "src", DESIGN_SRC_FILE), DESIGN_SRC_CONTENT);
        writeFileSync(
          join(dest, "package.json"),
          JSON.stringify({ dependencies: DESIGN_DEPENDENCIES, devDependencies: DESIGN_DEV_DEPENDENCIES }),
        );
      }

      return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
    }) as typeof Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
    Bun.which = originalWhich;
    process.chdir(originalCwd);
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("design:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Generate a new design module");
    });
  });

  describe("run() - git guard", () => {
    test("should fail without cloning when git is not installed", async () => {
      Bun.which = (() => null) as typeof Bun.which;

      await command.run({ name: "Design", cwd: testDir });

      expect(spawnCalls.some((call) => call.cmd[0] === "git")).toBe(false);
      expect(process.exitCode).toBe(1);
      process.exitCode = 0;
    });
  });

  describe("run() - file generation", () => {
    test("should generate package.json with kebab name", async () => {
      await command.run({ name: "Design", cwd: testDir, silent: true });

      const filePath = join(testDir, "modules", "design", "package.json");
      expect(await exists(filePath)).toBe(true);
      expect(await read(filePath)).toContain("@module/design");
    });

    test("should generate tsconfig.json", async () => {
      await command.run({ name: "Design", cwd: testDir, silent: true });

      expect(await exists(join(testDir, "modules", "design", "tsconfig.json"))).toBe(true);
    });

    test("should generate yml file with design type", async () => {
      await command.run({ name: "Design", cwd: testDir, silent: true });

      const filePath = join(testDir, "modules", "design", "design.yml");
      expect(await exists(filePath)).toBe(true);

      const content = await read(filePath);
      expect(content).toContain('type: "design"');
      expect(content).not.toContain('type: "module"');
    });

    test("should remove the scaffolded module class file", async () => {
      await command.run({ name: "Design", cwd: testDir, silent: true });

      expect(await exists(join(testDir, "modules", "design", "src", "DesignModule.ts"))).toBe(false);
    });

    test("should remove the orphaned module spec file", async () => {
      await command.run({ name: "Design", cwd: testDir, silent: true });

      expect(await exists(join(testDir, "modules", "design", "tests", "DesignModule.spec.ts"))).toBe(false);
    });
  });

  describe("design source content", () => {
    test("should copy the repository src into the module src", async () => {
      await command.run({ name: "Design", cwd: testDir, silent: true });

      const filePath = join(testDir, "modules", "design", "src", DESIGN_SRC_FILE);
      expect(await exists(filePath)).toBe(true);
      expect(await read(filePath)).toBe(DESIGN_SRC_CONTENT);
    });

    test("should clone the design repository", async () => {
      await command.run({ name: "Design", cwd: testDir, silent: true });

      const cloneCall = spawnCalls.find((call) => call.cmd[0] === "git" && call.cmd[1] === "clone");
      expect(cloneCall).toBeDefined();
      expect(cloneCall?.cmd).toContain("https://github.com/ooneex/skeleton-design.git");
    });

    test("should run clone and installs silently without inheriting output", async () => {
      await command.run({ name: "Design", cwd: testDir, silent: true });

      const setupCalls = spawnCalls.filter(
        (call) =>
          (call.cmd[0] === "git" && call.cmd[1] === "clone") || (call.cmd[0] === "bun" && call.cmd[1] === "add"),
      );
      expect(setupCalls.length).toBeGreaterThan(0);
      for (const call of setupCalls) {
        expect(call.stderr).toBe("pipe");
      }
    });
  });

  describe("dependency installation", () => {
    test("should install dependencies from the design package.json at the project root", async () => {
      await command.run({ name: "Design", cwd: testDir, silent: true });

      const depsCall = spawnCalls.find(
        (call) => call.cmd[0] === "bun" && call.cmd[1] === "add" && call.cmd[2] !== "-D",
      );
      expect(depsCall).toBeDefined();
      expect(depsCall?.cmd).toContain("react");
      expect(depsCall?.cmd).not.toContain("react@^18.0.0");
      expect(depsCall?.cwd).toBe(testDir);
    });

    test("should install devDependencies from the design package.json at the project root", async () => {
      await command.run({ name: "Design", cwd: testDir, silent: true });

      const devDepsCall = spawnCalls.find(
        (call) => call.cmd[0] === "bun" && call.cmd[1] === "add" && call.cmd[2] === "-D",
      );
      expect(devDepsCall).toBeDefined();
      expect(devDepsCall?.cmd).toContain("typescript");
      expect(devDepsCall?.cmd).not.toContain("typescript@^5.0.0");
      expect(devDepsCall?.cwd).toBe(testDir);
    });
  });

  describe("name normalization", () => {
    test("should normalize name to kebab-case for directory", async () => {
      await command.run({ name: "DesignSystem", cwd: testDir, silent: true });

      expect(await exists(join(testDir, "modules", "design-system", "design-system.yml"))).toBe(true);
    });

    test("should strip Module suffix from provided name", async () => {
      await command.run({ name: "DesignModule", cwd: testDir, silent: true });

      expect(await exists(join(testDir, "modules", "design", "package.json"))).toBe(true);
    });

    test("should prompt for name when not provided", async () => {
      await command.run({ cwd: testDir, silent: true });

      // enquirer mock resolves { name: "Test" }
      expect(await exists(join(testDir, "modules", "test", "test.yml"))).toBe(true);
    });
  });

  describe("AppModule integration", () => {
    beforeEach(async () => {
      const appModuleContent = moduleTemplate.replace(/{{NAME}}/g, "App");
      await Bun.write(join(testDir, "modules", "app", "src", "AppModule.ts"), appModuleContent);
    });

    test("should not register the design module into AppModule", async () => {
      await command.run({ name: "Design", cwd: testDir, silent: true });

      const content = await read(join(testDir, "modules", "app", "src", "AppModule.ts"));
      expect(content).not.toContain("DesignModule");
    });
  });

  describe("SharedModule integration", () => {
    beforeEach(async () => {
      const sharedModuleContent = moduleTemplate.replace(/{{NAME}}/g, "Shared");
      await Bun.write(join(testDir, "modules", "shared", "src", "SharedModule.ts"), sharedModuleContent);
    });

    test("should not register the design module into SharedModule", async () => {
      await command.run({ name: "Design", cwd: testDir, silent: true });

      const content = await read(join(testDir, "modules", "shared", "src", "SharedModule.ts"));
      expect(content).not.toContain("DesignModule");
    });
  });
});
