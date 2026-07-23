import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let createCiCdConfirm = false;
let ciProvider = "github";

mock.module("enquirer", () => ({
  prompt: mock((config: { type?: string; name?: string }) => {
    if (config?.type === "confirm" && config?.name === "confirm") {
      return Promise.resolve({ confirm: createCiCdConfirm });
    }
    if (config?.type === "select" && config?.name === "provider") {
      return Promise.resolve({ provider: ciProvider });
    }
    if (config?.type === "multiselect") {
      return Promise.resolve({ agents: [] });
    }
    return Promise.resolve({ name: "Test" });
  }),
}));

const infoSpy = mock((..._args: unknown[]) => {});

mock.module("@talosjs/logger", () => ({
  TerminalLogger: class {
    init() {}
    info(...args: unknown[]) {
      infoSpy(...args);
    }
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

const { AppCreateCommand } = await import("@/commands/AppCreateCommand");
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

describe("AppCreateCommand", () => {
  let command: InstanceType<typeof AppCreateCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    command = new AppCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `app-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);
    infoSpy.mockClear();
    createCiCdConfirm = false;
    ciProvider = "github";
    resetSkeletonDirCache();

    originalSpawn = Bun.spawn;
    Bun.spawn = ((...args: unknown[]) => {
      const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;
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
    process.chdir(originalCwd);
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
      expect(command.getDescription()).toBe("Create a new application");
    });
  });

  describe("run()", () => {
    test("should generate root configuration files", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      expect(await exists(join(testDir, ".gitignore"))).toBe(true);
      expect(await exists(join(testDir, ".dockerignore"))).toBe(true);
      expect(await exists(join(testDir, "biome.jsonc"))).toBe(true);
      expect(await exists(join(testDir, "package.json"))).toBe(true);
      expect(await exists(join(testDir, "README.md"))).toBe(true);
      expect(await exists(join(testDir, "tsconfig.json"))).toBe(true);
      expect(await exists(join(testDir, ".zed", "settings.json"))).toBe(true);
      expect(await exists(join(testDir, ".env.example.yml"))).toBe(true);
      expect(await exists(join(testDir, ".env.yml"))).toBe(true);
    });

    test("should ship a root package.json derived from the skeleton with the app name and workspaces", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      const pkg = await Bun.file(join(testDir, "package.json")).json();
      expect(pkg.name).toBe("my-app");
      expect(pkg.workspaces).toEqual(["modules/*"]);
    });

    test("should scaffold only the app and shared modules from the skeleton", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      expect(await exists(join(testDir, "modules", "app", "src", "AppModule.ts"))).toBe(true);
      expect(await exists(join(testDir, "modules", "shared", "src", "SharedModule.ts"))).toBe(true);
      expect(await exists(join(testDir, "modules", "design"))).toBe(false);
      expect(await exists(join(testDir, "modules", "sdk"))).toBe(false);
    });

    test("should keep the app module yml as an api scaffold", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      const content = await Bun.file(join(testDir, "modules", "app", "app.yml")).text();
      expect(content).toContain('type: "api"');
      expect(content).not.toContain('type: "module"');
    });

    test("should copy shared database and overwrite shared roles dynamically", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      expect(await exists(join(testDir, "modules", "shared", "src", "databases", "SharedDatabase.ts"))).toBe(true);
      const roles = await Bun.file(join(testDir, "modules", "shared", "src", "roles.yml")).text();
      expect(roles).toContain("ROLE_GUEST");
      expect(roles).toContain("ROLE_SUPER_ADMIN");
      expect(roles).toMatch(/inherits:\n {6}- ROLE_/m);
    });

    test("should copy env example into both env files", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      const envExample = await Bun.file(join(testDir, ".env.example.yml")).text();
      const env = await Bun.file(join(testDir, ".env.yml")).text();
      expect(env).toBe(envExample);
    });

    test("should filter root tsconfig path aliases down to app and shared", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      const tsconfig = await Bun.file(join(testDir, "tsconfig.json")).json();
      expect(tsconfig.compilerOptions.paths).toEqual({
        "@module/app/*": ["./modules/app/src/*"],
        "@module/shared/*": ["./modules/shared/src/*"],
      });
    });

    test("should rewrite Dockerfile and docker-compose placeholders with snake_case name", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      const dockerfile = await Bun.file(join(testDir, "modules", "app", "Dockerfile")).text();
      expect(dockerfile).toContain("my_app");
      expect(dockerfile).not.toContain("skeleton");

      const compose = await Bun.file(join(testDir, "modules", "app", "docker-compose.yml")).text();
      expect(compose).toContain("my_app_db");
      expect(compose).toContain("my_app_redis");
      expect(compose).not.toContain("skeleton");
    });

    test("should remove bun.lock from the generated app root", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      expect(await exists(join(testDir, "bun.lock"))).toBe(false);
    });

    test("should generate root var directory with .gitkeep", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      expect(await exists(join(testDir, "var", ".gitkeep"))).toBe(true);
    });

    test("should display next steps after creation", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      const messages = infoSpy.mock.calls.map((call) => call[0] as string);
      expect(messages.some((msg) => msg.includes(`cd ${testDir}`))).toBe(true);
      expect(messages.some((msg) => msg.includes("talos app:start"))).toBe(true);
      expect(messages.some((msg) => msg.includes("talos app:stop"))).toBe(true);
    });

    test("should clone the skeleton repository and initialize git", async () => {
      const spawnCalls: string[][] = [];

      Bun.spawn = ((...args: unknown[]) => {
        const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;
        if (Array.isArray(cmd)) {
          spawnCalls.push([...(cmd as string[])]);
          if (cmd[0] === "git" && cmd[1] === "clone") {
            cpSync(skeletonFixture, cmd[cmd.length - 1] as string, { recursive: true });
          }
        }
        return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
      }) as typeof Bun.spawn;

      await command.run({ name: "MyApp", destination: testDir });

      expect(spawnCalls.some((cmd) => cmd[0] === "git" && cmd[1] === "clone")).toBe(true);
      expect(spawnCalls.some((cmd) => cmd[0] === "git" && cmd[1] === "init")).toBe(true);
    });

    test("should not create CI/CD files when user declines", async () => {
      createCiCdConfirm = false;
      await command.run({ name: "MyApp", destination: testDir });

      expect(await exists(join(testDir, ".github", "workflows", "ci.yml"))).toBe(false);
      expect(await exists(join(testDir, ".gitlab-ci.yml"))).toBe(false);
      expect(await exists(join(testDir, "bitbucket-pipelines.yml"))).toBe(false);
      expect(await exists(join(testDir, "renovate.json"))).toBe(false);
    });
  });

  describe("CI/CD file generation", () => {
    test("should create GitHub workflow files when github is selected", async () => {
      createCiCdConfirm = true;
      ciProvider = "github";
      await command.run({ name: "MyApp", destination: testDir });

      expect(await exists(join(testDir, ".github", "workflows", "ci.yml"))).toBe(true);
      expect(await exists(join(testDir, ".github", "workflows", "production.yml"))).toBe(true);
      expect(await exists(join(testDir, "renovate.json"))).toBe(true);
    });

    test("should create GitLab pipeline files when gitlab is selected", async () => {
      createCiCdConfirm = true;
      ciProvider = "gitlab";
      await command.run({ name: "MyApp", destination: testDir });

      expect(await exists(join(testDir, ".gitlab", "ci", "ci.yml"))).toBe(true);
      expect(await exists(join(testDir, ".gitlab", "ci", "production.yml"))).toBe(true);
      expect(await exists(join(testDir, ".gitlab-ci.yml"))).toBe(true);
      expect(await exists(join(testDir, "renovate.json"))).toBe(true);
    });

    test("should create Bitbucket files when bitbucket is selected", async () => {
      createCiCdConfirm = true;
      ciProvider = "bitbucket";
      await command.run({ name: "MyApp", destination: testDir });

      expect(await exists(join(testDir, "bitbucket-pipelines.yml"))).toBe(true);
      expect(await exists(join(testDir, "renovate.json"))).toBe(true);
    });
  });
});
