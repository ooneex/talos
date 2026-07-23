import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cpSync, existsSync, rmSync } from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let selectedAgents: string[] = [];
let confirmResponses: Record<string, boolean> = {};
let promptedName = "test-app";
let promptedDestination = "test-app";

mock.module("enquirer", () => ({
  prompt: mock((config: { type?: string; name?: string; message?: string }) => {
    if (config?.type === "multiselect") {
      return Promise.resolve({ agents: selectedAgents });
    }
    if (config?.type === "confirm") {
      return Promise.resolve({ confirm: confirmResponses[config.message ?? ""] ?? false });
    }
    if (config?.name === "destination") {
      return Promise.resolve({ destination: promptedDestination });
    }
    return Promise.resolve({ name: promptedName });
  }),
}));

const { AppInitCommand } = await import("@/commands/AppInitCommand");
const { resetSkeletonDirCache } = await import("@/agentConfig");

// Synthetic stand-in for https://github.com/ooneex/skeleton.git, built once
// from local files on disk under the OS tmp dir. This keeps the suite fully
// offline and fast: no network call is ever made, and there's nothing to
// clone or block on. Each test's faked `git clone` (see the `Bun.spawn` mock
// below) copies this fixture instead of hitting the network.
const skeletonFixtureDir = join(tmpdir(), "talos-cli-tests-skeleton-fixture");

const buildTestSkeletonFixture = async (): Promise<string> => {
  await rm(skeletonFixtureDir, { recursive: true, force: true });
  await mkdir(skeletonFixtureDir, { recursive: true });

  await Bun.write(join(skeletonFixtureDir, "AGENTS.md"), "# {{NAME}}\n\nFixture guidance for tests.\n");
  await Bun.write(join(skeletonFixtureDir, "README.md"), "# skeleton\n\nFixture readme for tests.\n");
  await Bun.write(join(skeletonFixtureDir, ".env.example.yml"), "app:\n  env: local\n");
  await Bun.write(join(skeletonFixtureDir, ".dockerignore"), "node_modules\n");
  await Bun.write(join(skeletonFixtureDir, "bun.lock"), "{}\n");
  await Bun.write(
    join(skeletonFixtureDir, "package.json"),
    JSON.stringify({ name: "skeleton", version: "0.0.0" }, null, 2),
  );

  for (const moduleName of ["app", "design", "sdk", "shared", "spa", "storybook"]) {
    await mkdir(join(skeletonFixtureDir, "modules", moduleName), { recursive: true });
    await Bun.write(join(skeletonFixtureDir, "modules", moduleName, ".gitkeep"), "");
  }

  await mkdir(join(skeletonFixtureDir, ".claude", "agents"), { recursive: true });
  await Bun.write(
    join(skeletonFixtureDir, ".claude", "agents", "test-author.md"),
    "---\nname: test-author\n---\n\nFixture agent body.\n",
  );

  await mkdir(join(skeletonFixtureDir, ".claude", "skills", "commit"), { recursive: true });
  await Bun.write(
    join(skeletonFixtureDir, ".claude", "skills", "commit", "SKILL.md"),
    "---\nname: commit\n---\n\nFixture skill body.\n",
  );

  return skeletonFixtureDir;
};

const skeletonFixture = await buildTestSkeletonFixture();

describe("AppInitCommand", () => {
  let command: InstanceType<typeof AppInitCommand>;
  let testDir: string;
  let originalSpawn: typeof Bun.spawn;
  let originalWhich: typeof Bun.which;
  let cloneExitCode: number;
  let bunInstallExitCode: number;

  afterAll(async () => {
    await rm(skeletonFixtureDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    command = new AppInitCommand();
    testDir = join(process.cwd(), ".temp", `app-init-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    selectedAgents = [];
    confirmResponses = {};
    promptedName = "My App";
    promptedDestination = testDir;
    cloneExitCode = 0;
    bunInstallExitCode = 0;
    resetSkeletonDirCache();

    originalWhich = Bun.which;
    originalSpawn = Bun.spawn;
    Bun.spawn = ((...args: unknown[]) => {
      const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;

      // Fake the skeleton clone: copy the cached fixture instead of hitting the network.
      if (Array.isArray(cmd) && cmd[0] === "git" && cmd[1] === "clone") {
        if (cloneExitCode === 0) {
          cpSync(skeletonFixture, cmd[cmd.length - 1] as string, { recursive: true });
        }
        return { exited: Promise.resolve(cloneExitCode) } as unknown as ReturnType<typeof Bun.spawn>;
      }

      // Fake `bun install` so tests never depend on network/registry access.
      if (Array.isArray(cmd) && cmd[0] === "bun" && cmd[1] === "install") {
        return { exited: Promise.resolve(bunInstallExitCode) } as unknown as ReturnType<typeof Bun.spawn>;
      }

      // Everything else (git init, git rev-parse, ...) runs for real against testDir.
      return originalSpawn.apply(Bun, args as Parameters<typeof Bun.spawn>);
    }) as typeof Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
    Bun.which = originalWhich;
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
      expect(command.getDescription().length).toBeGreaterThan(0);
    });
  });

  describe("run()", () => {
    test("should scaffold the skeleton, install deps and initialize git", async () => {
      await command.run({ name: "My App", destination: testDir, silent: true });

      expect(existsSync(join(testDir, ".git"))).toBe(true);
      expect(existsSync(join(testDir, "bun.lock"))).toBe(false);
      expect(existsSync(join(testDir, ".env.example.yml"))).toBe(false);
      expect(existsSync(join(testDir, ".env.yml"))).toBe(true);

      const readme = await Bun.file(join(testDir, "README.md")).text();
      expect(readme.startsWith("# my-app")).toBe(true);
    }, 30000);

    test("should keep every module when appType is omitted", async () => {
      await command.run({ name: "My App", destination: testDir, silent: true });

      const modules = await readdir(join(testDir, "modules"));
      expect(modules.sort()).toEqual(["app", "design", "sdk", "shared", "spa", "storybook"]);
    }, 30000);

    test("should empty the modules directory and drop .dockerignore for appType 'cli'", async () => {
      await command.run({ name: "My App", destination: testDir, silent: true, appType: "cli" });

      expect(existsSync(join(testDir, "modules"))).toBe(true);
      expect(await readdir(join(testDir, "modules"))).toEqual([]);
      expect(existsSync(join(testDir, ".dockerignore"))).toBe(false);
    }, 30000);

    test("should keep only app and shared modules for appType 'api'", async () => {
      await command.run({ name: "My App", destination: testDir, silent: true, appType: "api" });

      const modules = await readdir(join(testDir, "modules"));
      expect(modules.sort()).toEqual(["app", "shared"]);
    }, 30000);

    test("should stop without scaffolding when the skeleton clone fails", async () => {
      cloneExitCode = 1;

      await command.run({ name: "My App", destination: testDir, silent: true });

      expect(existsSync(testDir)).toBe(false);
      expect(process.exitCode).toBe(1);
      process.exitCode = 0;
    }, 30000);

    test("should stop before initializing git when dependency install fails", async () => {
      bunInstallExitCode = 1;

      await command.run({ name: "My App", destination: testDir, silent: true });

      expect(existsSync(join(testDir, "modules"))).toBe(true);
      expect(existsSync(join(testDir, ".git"))).toBe(false);
      expect(process.exitCode).toBe(1);
      process.exitCode = 0;
    }, 30000);

    test("should stop without initializing git when git is not installed", async () => {
      Bun.which = (() => null) as typeof Bun.which;

      await command.run({ name: "My App", destination: testDir, silent: true });

      expect(existsSync(join(testDir, ".git"))).toBe(false);
      expect(process.exitCode).toBe(1);
      process.exitCode = 0;
    }, 30000);

    test("should install the commit-msg hook when confirmed", async () => {
      confirmResponses["Install the commit-msg hook?"] = true;

      await command.run({ name: "My App", destination: testDir, silent: true });

      expect(existsSync(join(testDir, ".git", "hooks", "commit-msg"))).toBe(true);
    }, 30000);

    test("should skip the commit-msg hook when declined", async () => {
      confirmResponses["Install the commit-msg hook?"] = false;

      await command.run({ name: "My App", destination: testDir, silent: true });

      expect(existsSync(join(testDir, ".git", "hooks", "commit-msg"))).toBe(false);
    }, 30000);

    test("should scaffold skills for the selected coding assistants", async () => {
      selectedAgents = [".claude"];

      await command.run({ name: "My App", destination: testDir, silent: true });

      expect(existsSync(join(testDir, "AGENTS.md"))).toBe(true);
      expect(await Bun.file(join(testDir, "AGENTS.md")).text()).toContain("my-app");
    }, 30000);

    test("should prompt for name and destination when not provided", async () => {
      await command.run({ silent: true });

      const readme = await Bun.file(join(testDir, "README.md")).text();
      expect(readme.startsWith("# my-app")).toBe(true);
    }, 30000);
  });
});
