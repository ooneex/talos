import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Glob } from "bun";

let installCommitHook = true;
let selectedAgents: string[] = [".claude"];

mock.module("enquirer", () => ({
  prompt: mock((config: { type?: string }) => {
    if (config?.type === "confirm") {
      return Promise.resolve({ confirm: installCommitHook });
    }
    if (config?.type === "multiselect") {
      return Promise.resolve({ agents: selectedAgents });
    }
    return Promise.resolve({ name: "Test" });
  }),
}));

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
const { resetSkeletonDirCache } = await import("@/agentConfig");

const exists = (path: string) => Bun.file(path).exists();

// Real checkout of https://github.com/ooneex/skeleton.git, cloned once and cached
// on disk under the OS tmp dir. Each test's faked `git clone` copies this cache
// instead of hitting the network. Must resolve before any test replaces
// `Bun.spawn` (this runs at module load, before `beforeEach`), so the real git
// clone runs instead of a test's faked `git` responses.
const skeletonSourceCacheDir = join(tmpdir(), "talos-cli-tests-skeleton-source");
const skeletonSourceReadyMarker = join(skeletonSourceCacheDir, ".ready");

const resolveTestSkeletonSource = async (): Promise<string> => {
  if (existsSync(skeletonSourceReadyMarker)) {
    return skeletonSourceCacheDir;
  }

  await rm(skeletonSourceCacheDir, { recursive: true, force: true });

  const proc = Bun.spawn(
    ["git", "clone", "--depth", "1", "https://github.com/ooneex/skeleton.git", skeletonSourceCacheDir],
    { stdout: "ignore", stderr: "pipe" },
  );
  const [exitCode, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);

  if (exitCode !== 0) {
    throw new Error(`Failed to clone skeleton repo for tests: ${stderr.trim()}`);
  }

  await Bun.write(skeletonSourceReadyMarker, "");
  return skeletonSourceCacheDir;
};

const skeletonFixture = await resolveTestSkeletonSource();

describe("AppInitCommand", () => {
  let command: InstanceType<typeof AppInitCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;
  let originalWhich: typeof Bun.which;
  let spawnCalls: string[][];

  beforeEach(() => {
    installCommitHook = true;
    selectedAgents = [".claude"];
    command = new AppInitCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `app-init-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);
    spawnCalls = [];
    resetSkeletonDirCache();

    originalWhich = Bun.which;
    Bun.which = (() => "/usr/bin/git") as typeof Bun.which;

    originalSpawn = Bun.spawn;
    Bun.spawn = ((...args: unknown[]) => {
      const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;
      if (Array.isArray(cmd)) {
        spawnCalls.push([...(cmd as string[])]);
      }
      if (Array.isArray(cmd) && cmd[0] === "git" && cmd[1] === "clone") {
        cpSync(skeletonFixture, cmd[cmd.length - 1] as string, { recursive: true });
        return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
      }
      if (Array.isArray(cmd) && ((cmd[0] === "bun" && (cmd[1] === "update" || cmd[1] === "add")) || cmd[0] === "git")) {
        return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
      }
      return originalSpawn.apply(Bun, args as Parameters<typeof Bun.spawn>);
    }) as typeof Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
    Bun.which = originalWhich;
    process.chdir(originalCwd);
    resetSkeletonDirCache();
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

  describe("run() - git guard", () => {
    test("should fail without running git init when git is not installed", async () => {
      Bun.which = (() => null) as typeof Bun.which;

      await command.run({ name: "MyApp", destination: testDir });

      expect(spawnCalls.some((cmd) => cmd[0] === "git" && cmd[1] === "init")).toBe(false);
      expect(process.exitCode).toBe(1);
      process.exitCode = 0;
    });
  });

  describe("run()", () => {
    test("should generate root configuration files", async () => {
      await command.run({ name: "MyApp", destination: testDir, silent: true });

      expect(await exists(join(testDir, ".gitignore"))).toBe(true);
      expect(await exists(join(testDir, "biome.jsonc"))).toBe(true);
      expect(await exists(join(testDir, "package.json"))).toBe(true);
      expect(await exists(join(testDir, "README.md"))).toBe(true);
      expect(await exists(join(testDir, "tsconfig.json"))).toBe(true);
      expect(await exists(join(testDir, ".zed", "settings.json"))).toBe(true);
      expect(await exists(join(testDir, ".env.example.yml"))).toBe(true);
      expect(await exists(join(testDir, ".env.yml"))).toBe(true);
    });

    test("should not generate bunfig.toml", async () => {
      await command.run({ name: "MyApp", destination: testDir, silent: true });

      expect(await exists(join(testDir, "bunfig.toml"))).toBe(false);
    });

    test("should generate root var directory with .gitkeep", async () => {
      await command.run({ name: "MyApp", destination: testDir, silent: true });

      expect(await exists(join(testDir, "var", ".gitkeep"))).toBe(true);
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

    test("should copy env example into both env files", async () => {
      await command.run({ name: "MyApp", destination: testDir, silent: true });

      const envExample = await Bun.file(join(testDir, ".env.example.yml")).text();
      const env = await Bun.file(join(testDir, ".env.yml")).text();
      expect(env).toBe(envExample);
      expect(env).toContain("localhost:5432/talos");
      expect(env).toContain("redis://localhost:6379");
      expect(env).toContain("# Application settings");
      expect(env).not.toContain("analytics:");
    });

    test("should keep .env.yml at the project root for all app types", async () => {
      await command.run({ name: "MyApp", destination: testDir, silent: true, appType: "api" });
      expect(await exists(join(testDir, ".env.yml"))).toBe(true);
      expect(await exists(join(testDir, "modules", "shared", ".env.yml"))).toBe(false);
    });

    test("should filter tsconfig path aliases down to app and shared", async () => {
      await command.run({ name: "MyApp", destination: testDir, silent: true });

      const tsconfig = await Bun.file(join(testDir, "tsconfig.json")).json();
      expect(tsconfig.compilerOptions.paths).toEqual({
        "@module/app/*": ["./modules/app/src/*"],
        "@module/shared/*": ["./modules/shared/src/*"],
      });
    });

    const skillFileCount = async (skillsDir: string) => {
      const glob = new Glob("*/SKILL.md");
      const files: string[] = [];

      for await (const file of glob.scan(skillsDir)) {
        files.push(file);
      }

      return files.length;
    };

    test("should delegate skills scaffolding for the selected assistants", async () => {
      selectedAgents = [".claude"];
      await command.run({ name: "MyApp", destination: testDir, silent: true });

      expect(await skillFileCount(join(testDir, ".claude", "skills"))).toBeGreaterThan(0);
      expect(await exists(join(testDir, "AGENTS.md"))).toBe(true);
      expect(await Bun.file(join(testDir, "AGENTS.md")).text()).toContain("my-app");
    });

    test("should not generate any assistant skills when none are selected", async () => {
      selectedAgents = [];
      await command.run({ name: "MyApp", destination: testDir, silent: true });

      expect(existsSync(join(testDir, ".claude", "skills"))).toBe(false);
      expect(existsSync(join(testDir, ".codex", "skills"))).toBe(false);
    });

    test("should not install the commit-msg hook when confirmation is declined", async () => {
      installCommitHook = false;
      await command.run({ name: "MyApp", destination: testDir, silent: true });

      expect(await exists(join(testDir, ".git", "hooks", "commit-msg"))).toBe(false);
    });

    test("should install dev dependencies including @talosjs/cli without husky or commitlint", async () => {
      const localSpawnCalls: string[][] = [];

      Bun.spawn = ((...args: unknown[]) => {
        const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;
        if (Array.isArray(cmd)) {
          localSpawnCalls.push([...(cmd as string[])]);
        }
        if (Array.isArray(cmd) && cmd[0] === "git" && cmd[1] === "clone") {
          cpSync(skeletonFixture, cmd[cmd.length - 1] as string, { recursive: true });
        }
        return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
      }) as typeof Bun.spawn;

      await command.run({ name: "MyApp", destination: testDir, silent: true });

      const devDepsCall = localSpawnCalls.find((cmd) => cmd[0] === "bun" && cmd[1] === "add" && cmd[2] === "-D");
      expect(devDepsCall).toBeDefined();
      expect(devDepsCall).toContain("@talosjs/cli");
      expect(devDepsCall).toContain("typescript");
      expect(devDepsCall).not.toContain("husky");
      expect(devDepsCall).not.toContain("lint-staged");
      expect(devDepsCall?.some((dep) => dep.startsWith("@commitlint/"))).toBe(false);
      expect(devDepsCall).not.toContain("nx");
      expect(devDepsCall).not.toContain("git");
    });

    test("should initialize git repository", async () => {
      const localSpawnCalls: string[][] = [];

      Bun.spawn = ((...args: unknown[]) => {
        const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;
        if (Array.isArray(cmd)) {
          localSpawnCalls.push([...(cmd as string[])]);
        }
        if (Array.isArray(cmd) && cmd[0] === "git" && cmd[1] === "clone") {
          cpSync(skeletonFixture, cmd[cmd.length - 1] as string, { recursive: true });
        }
        return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
      }) as typeof Bun.spawn;

      await command.run({ name: "MyApp", destination: testDir, silent: true });

      const gitInitCall = localSpawnCalls.find((cmd) => cmd[0] === "git" && cmd[1] === "init");
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
        if (Array.isArray(cmd) && cmd[0] === "git" && cmd[1] === "clone") {
          cpSync(skeletonFixture, cmd[cmd.length - 1] as string, { recursive: true });
        }
        return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
      }) as typeof Bun.spawn;

      await command.run({ name: "MyApp", destination: testDir, silent: true });

      const setupCalls = spawnOpts.filter(
        (call) => (call.cmd[0] === "bun" && call.cmd[1] === "add") || (call.cmd[0] === "git" && call.cmd[1] === "init"),
      );
      expect(setupCalls.length).toBeGreaterThan(0);
      for (const call of setupCalls) {
        expect(call.stderr).toBe("pipe");
      }
    });
  });
});
