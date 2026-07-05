import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";

let claudeSkillsConfirm = true;

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock((config: { type?: string }) => {
    if (config?.type === "confirm") {
      return Promise.resolve({ confirm: claudeSkillsConfirm });
    }
    return Promise.resolve({ name: "Test" });
  }),
}));

// Mock logger to suppress output
mock.module("@talosjs/logger", () => ({
  TerminalLogger: class {
    init() {}
    info() {}
    error() {}
    warn() {}
    debug() {}
    log() {}
    success() {}
  },
  decorator: {
    logger: () => () => {},
  },
}));

const { AppInitCommand } = await import("@/commands/AppInitCommand");

const exists = (path: string) => Bun.file(path).exists();

describe("AppInitCommand", () => {
  let command: InstanceType<typeof AppInitCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    claudeSkillsConfirm = true;
    command = new AppInitCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `app-init-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);

    originalSpawn = Bun.spawn;
    Bun.spawn = ((...args: unknown[]) => {
      const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;
      if (
        Array.isArray(cmd) &&
        ((cmd[0] === "bun" && (cmd[1] === "update" || cmd[1] === "add")) ||
          (cmd[0] === "git" && cmd[1] === "init") ||
          (cmd[0] === "bunx" && cmd[1] === "husky"))
      ) {
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
      expect(command.getName()).toBe("app:init");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Initialize an application");
    });
  });

  describe("run()", () => {
    test("should generate root configuration files", async () => {
      await command.run({ name: "MyApp", destination: testDir, silent: true });

      expect(await exists(join(testDir, ".commitlintrc.ts"))).toBe(true);
      expect(await exists(join(testDir, ".gitignore"))).toBe(true);
      expect(await exists(join(testDir, "biome.jsonc"))).toBe(true);
      expect(await exists(join(testDir, "package.json"))).toBe(true);
      expect(await exists(join(testDir, "README.md"))).toBe(true);
      expect(await exists(join(testDir, "tsconfig.json"))).toBe(true);
      expect(await exists(join(testDir, ".zed", "settings.json"))).toBe(true);
    });

    test("should not generate bunfig.toml", async () => {
      await command.run({ name: "MyApp", destination: testDir, silent: true });

      expect(await exists(join(testDir, "bunfig.toml"))).toBe(false);
    });

    test("should generate root var directory with .gitkeep", async () => {
      await command.run({ name: "MyApp", destination: testDir, silent: true });

      expect(await exists(join(testDir, "var", ".gitkeep"))).toBe(true);
    });

    test("should generate husky hooks", async () => {
      await command.run({ name: "MyApp", destination: testDir, silent: true });

      expect(await exists(join(testDir, ".husky", "commit-msg"))).toBe(true);
      expect(await exists(join(testDir, ".husky", "pre-commit"))).toBe(true);
    });

    test("should replace {{NAME}} in package.json with kebab-case name", async () => {
      await command.run({ name: "MyApp", destination: testDir, silent: true });

      const content = await Bun.file(join(testDir, "package.json")).text();
      expect(content).toContain('"my-app"');
      expect(content).not.toContain("{{NAME}}");
    });

    test("should not override package.json if it already exists", async () => {
      const packageJsonPath = join(testDir, "package.json");
      await Bun.write(packageJsonPath, '{"name":"existing-app"}');

      await command.run({ name: "MyApp", destination: testDir, silent: true });

      const content = await Bun.file(packageJsonPath).text();
      expect(content).toBe('{"name":"existing-app"}');
    });

    test("should replace {{NAME}} in README.md with kebab-case name", async () => {
      await command.run({ name: "MyApp", destination: testDir, silent: true });

      const content = await Bun.file(join(testDir, "README.md")).text();
      expect(content).toContain("# my-app");
      expect(content).not.toContain("{{NAME}}");
    });

    test("should write .env.yml to destination root when appType is not set", async () => {
      await command.run({ name: "MyApp", destination: testDir, silent: true });

      expect(await exists(join(testDir, ".env.yml"))).toBe(true);
      expect(await exists(join(testDir, "modules", "shared", ".env.yml"))).toBe(false);
    });

    test("should write .env.yml to destination root when appType is cli", async () => {
      await command.run({ name: "MyApp", destination: testDir, silent: true, appType: "cli" });

      expect(await exists(join(testDir, ".env.yml"))).toBe(true);
      expect(await exists(join(testDir, "modules", "shared", ".env.yml"))).toBe(false);
    });

    test("should write .env.yml to destination root when appType is api", async () => {
      await command.run({ name: "MyApp", destination: testDir, silent: true, appType: "api" });

      expect(await exists(join(testDir, ".env.yml"))).toBe(true);
      expect(await exists(join(testDir, "modules", "shared", ".env.yml"))).toBe(false);
    });

    test("should populate .env.yml with default values when appType is api", async () => {
      await command.run({ name: "MyApp", destination: testDir, silent: true, appType: "api" });

      const content = await Bun.file(join(testDir, ".env.yml")).text();
      expect(content).toContain("postgresql://talos:talos@localhost:5432/talos");
      expect(content).toContain("redis://localhost:6379");
    });

    test("should populate .env.yml with default values", async () => {
      await command.run({ name: "MyApp", destination: testDir, silent: true });

      const content = await Bun.file(join(testDir, ".env.yml")).text();
      expect(content).toContain("postgresql://talos:talos@localhost:5432/talos");
      expect(content).toContain("redis://localhost:6379");
    });

    test("should annotate .env.yml with section and env-var comments", async () => {
      await command.run({ name: "MyApp", destination: testDir, silent: true });

      const content = await Bun.file(join(testDir, ".env.yml")).text();
      expect(content).toContain("# Application settings");
      expect(content).toContain("# Caching layer");
      expect(content).toContain("# DATABASE_URL");
      expect(content).toContain("# CACHE_REDIS_URL");
      // Top-level sections are separated by a blank line, mirroring env.yml.
      expect(content).toMatch(/\n\n# Logging configuration\nlogs:/);
    });

    test("should not emit comments for the removed analytics section", async () => {
      await command.run({ name: "MyApp", destination: testDir, silent: true });

      const content = await Bun.file(join(testDir, ".env.yml")).text();
      expect(content).not.toContain("# Analytics and telemetry");
      expect(content).not.toContain("analytics:");
    });

    test("should write .env.yml in block-style YAML format", async () => {
      await command.run({ name: "MyApp", destination: testDir, silent: true });

      const content = await Bun.file(join(testDir, ".env.yml")).text();
      expect(content).not.toMatch(/^\{/); // no flow-style opening brace
      expect(content).toMatch(/^app:$/m);
      expect(content).toMatch(/^database:$/m);
      expect(content).toMatch(/^cache:$/m);
      expect(content).toMatch(/^queue:$/m);
      expect(content).toMatch(/^ {2}url:/m); // nested keys are indented
    });

    test('should write empty string values as quoted "" in .env.yml', async () => {
      await command.run({ name: "MyApp", destination: testDir, silent: true });

      const content = await Bun.file(join(testDir, ".env.yml")).text();
      expect(content).toContain('host: ""');
      expect(content).toContain('database_url: ""');
      expect(content).toContain('source_token: ""');
    });

    test("should generate Claude skills in destination directory when confirmed", async () => {
      claudeSkillsConfirm = true;
      await command.run({ name: "MyApp", destination: testDir, silent: true });

      const skillsDir = join(testDir, ".claude", "skills");
      const glob = new Glob("*/SKILL.md");
      const files: string[] = [];

      for await (const file of glob.scan(skillsDir)) {
        files.push(file);
      }

      expect(files.length).toBeGreaterThan(0);
    });

    test("should not generate Claude skills when confirmation is declined", async () => {
      claudeSkillsConfirm = false;
      await command.run({ name: "MyApp", destination: testDir, silent: true });

      const skillsDir = join(testDir, ".claude", "skills");
      expect(existsSync(skillsDir)).toBe(false);
    });

    test("should install dev dependencies including husky and @talosjs/cli", async () => {
      const spawnCalls: string[][] = [];

      Bun.spawn = ((...args: unknown[]) => {
        const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;
        if (Array.isArray(cmd)) {
          spawnCalls.push([...(cmd as string[])]);
        }
        return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
      }) as typeof Bun.spawn;

      await command.run({ name: "MyApp", destination: testDir, silent: true });

      const devDepsCall = spawnCalls.find((cmd) => cmd[0] === "bun" && cmd[1] === "add" && cmd[2] === "-D");
      expect(devDepsCall).toBeDefined();
      expect(devDepsCall).toContain("husky");
      expect(devDepsCall).toContain("@talosjs/cli");
      expect(devDepsCall).not.toContain("nx");
      expect(devDepsCall).toContain("typescript");
    });

    test("should initialize git repository", async () => {
      const spawnCalls: string[][] = [];

      Bun.spawn = ((...args: unknown[]) => {
        const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;
        if (Array.isArray(cmd)) {
          spawnCalls.push([...(cmd as string[])]);
        }
        return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
      }) as typeof Bun.spawn;

      await command.run({ name: "MyApp", destination: testDir, silent: true });

      const gitInitCall = spawnCalls.find((cmd) => cmd[0] === "git" && cmd[1] === "init");
      expect(gitInitCall).toBeDefined();
    });

    test("should run setup commands silently without inheriting output", async () => {
      const spawnOpts: { cmd: string[]; stderr: unknown }[] = [];

      Bun.spawn = ((...args: unknown[]) => {
        const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;
        const opts = args[1] as { stderr?: unknown } | undefined;
        if (Array.isArray(cmd)) {
          spawnOpts.push({ cmd: [...(cmd as string[])], stderr: opts?.stderr });
        }
        return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
      }) as typeof Bun.spawn;

      await command.run({ name: "MyApp", destination: testDir, silent: true });

      const setupCalls = spawnOpts.filter(
        (call) =>
          (call.cmd[0] === "bun" && call.cmd[1] === "add") ||
          (call.cmd[0] === "git" && call.cmd[1] === "init") ||
          (call.cmd[0] === "bunx" && call.cmd[1] === "husky"),
      );
      expect(setupCalls.length).toBeGreaterThan(0);
      for (const call of setupCalls) {
        expect(call.stderr).toBe("pipe");
      }
    });

    test("should not log success message when silent is true", async () => {
      const logCalls: string[] = [];
      const OriginalLogger = (await import("@talosjs/logger")).TerminalLogger as unknown as new () => {
        success: (...args: unknown[]) => void;
      };
      const instance = new OriginalLogger();
      const originalSuccess = instance.success;
      instance.success = (...args: unknown[]) => {
        logCalls.push(String(args[0]));
        return originalSuccess.apply(instance, args as Parameters<typeof originalSuccess>);
      };

      await command.run({ name: "MyApp", destination: testDir, silent: true });

      expect(logCalls).toHaveLength(0);
    });
  });
});
