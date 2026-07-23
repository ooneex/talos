import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cpSync, existsSync, rmSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let selectedAgents: string[] = [];
let confirmResponses: Record<string, boolean> = {};
let selectedProvider: "github" | "gitlab" | "bitbucket" = "github";
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
    if (config?.type === "select") {
      return Promise.resolve({ provider: selectedProvider });
    }
    if (config?.name === "destination") {
      return Promise.resolve({ destination: promptedDestination });
    }
    return Promise.resolve({ name: promptedName });
  }),
}));

const { AppCreateCommand } = await import("@/commands/AppCreateCommand");
const { resetSkeletonDirCache } = await import("@/agentConfig");

// Synthetic stand-in for https://github.com/ooneex/skeleton.git, built once
// from local files on disk under the OS tmp dir. This keeps the suite fully
// offline and fast: no network call is ever made, and there's nothing to
// clone or block on. Each test's faked `git clone` (see the `Bun.spawn` mock
// below) copies this fixture instead of hitting the network.
const skeletonFixtureDir = join(tmpdir(), "talos-cli-tests-skeleton-fixture-app-create");

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
  // AppCreateCommand always forwards appType: "api", which keeps only the
  // "app" and "shared" modules; the "should scaffold an API app" test reads
  // modules/shared/package.json to confirm it survived the prune.
  await Bun.write(
    join(skeletonFixtureDir, "modules", "shared", "package.json"),
    JSON.stringify({ name: "shared", version: "0.0.0" }, null, 2),
  );

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

describe("AppCreateCommand", () => {
  let command: InstanceType<typeof AppCreateCommand>;
  let testDir: string;
  let originalSpawn: typeof Bun.spawn;
  let originalWhich: typeof Bun.which;

  afterAll(async () => {
    await rm(skeletonFixtureDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    command = new AppCreateCommand();
    testDir = join(process.cwd(), ".temp", `app-create-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    selectedAgents = [];
    confirmResponses = {};
    selectedProvider = "github";
    promptedName = "My App";
    promptedDestination = testDir;
    resetSkeletonDirCache();

    originalWhich = Bun.which;
    originalSpawn = Bun.spawn;
    Bun.spawn = ((...args: unknown[]) => {
      const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;

      // Fake the skeleton clone: copy the cached fixture instead of hitting the network.
      if (Array.isArray(cmd) && cmd[0] === "git" && cmd[1] === "clone") {
        cpSync(skeletonFixture, cmd[cmd.length - 1] as string, { recursive: true });
        return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
      }

      // Fake `bun install` so tests never depend on network/registry access.
      if (Array.isArray(cmd) && cmd[0] === "bun" && cmd[1] === "install") {
        return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
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
      expect(command.getName()).toBe("app:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription().length).toBeGreaterThan(0);
    });
  });

  describe("run()", () => {
    test("should scaffold an API app via AppInitCommand and skip CI/CD files when declined", async () => {
      confirmResponses["Create CI/CD files?"] = false;

      await command.run({ name: "My App", destination: testDir });

      expect(existsSync(join(testDir, ".git"))).toBe(true);
      expect(existsSync(join(testDir, ".env.yml"))).toBe(true);

      const readme = await Bun.file(join(testDir, "README.md")).text();
      expect(readme.startsWith("# my-app")).toBe(true);

      // AppCreateCommand always forwards appType: "api" to AppInitCommand.
      const modules = await Bun.file(join(testDir, "modules", "shared", "package.json")).exists();
      expect(modules).toBe(true);
      expect(existsSync(join(testDir, "modules", "spa"))).toBe(false);

      expect(existsSync(join(testDir, ".github", "workflows", "ci.yml"))).toBe(false);
    }, 30000);

    test("should create GitHub workflow files and the renovate config", async () => {
      confirmResponses["Create CI/CD files?"] = true;
      selectedProvider = "github";

      await command.run({ name: "My App", destination: testDir });

      const ci = await Bun.file(join(testDir, ".github", "workflows", "ci.yml")).text();
      const production = await Bun.file(join(testDir, ".github", "workflows", "production.yml")).text();
      expect(ci).toContain("name: CI");
      expect(production).toContain("name: Deploy");
      expect(existsSync(join(testDir, "renovate.json"))).toBe(true);
    }, 30000);

    test("should create GitLab CI files and the include manifest", async () => {
      confirmResponses["Create CI/CD files?"] = true;
      selectedProvider = "gitlab";

      await command.run({ name: "My App", destination: testDir });

      expect(existsSync(join(testDir, ".gitlab", "ci", "ci.yml"))).toBe(true);
      expect(existsSync(join(testDir, ".gitlab", "ci", "production.yml"))).toBe(true);

      const includeManifest = await Bun.file(join(testDir, ".gitlab-ci.yml")).text();
      expect(includeManifest).toContain(".gitlab/ci/ci.yml");
      expect(includeManifest).toContain(".gitlab/ci/production.yml");
    }, 30000);

    test("should create the Bitbucket pipelines file", async () => {
      confirmResponses["Create CI/CD files?"] = true;
      selectedProvider = "bitbucket";

      await command.run({ name: "My App", destination: testDir });

      expect(existsSync(join(testDir, "bitbucket-pipelines.yml"))).toBe(true);
      const pipelines = await Bun.file(join(testDir, "bitbucket-pipelines.yml")).text();
      expect(pipelines).toContain("image: oven/bun:latest");
    }, 30000);

    test("should prompt for name and destination when not provided", async () => {
      confirmResponses["Create CI/CD files?"] = false;

      await command.run({});

      const readme = await Bun.file(join(testDir, "README.md")).text();
      expect(readme.startsWith("# my-app")).toBe(true);
    }, 30000);
  });
});
