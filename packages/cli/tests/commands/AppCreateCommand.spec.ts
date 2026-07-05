import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

let createCiCdConfirm = false;
let ciProvider = "github";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock((config: { type?: string; name?: string }) => {
    if (config?.type === "confirm" && config?.name === "confirm") {
      return Promise.resolve({ confirm: createCiCdConfirm });
    }
    if (config?.type === "select" && config?.name === "provider") {
      return Promise.resolve({ provider: ciProvider });
    }
    return Promise.resolve({ name: "Test" });
  }),
}));

const infoSpy = mock((..._args: unknown[]) => {});

// Mock logger to suppress output
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

const exists = (path: string) => Bun.file(path).exists();

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

    // Mock Bun.spawn to avoid running bun update and git init in tests
    originalSpawn = Bun.spawn;
    Bun.spawn = ((...args: unknown[]) => {
      const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;
      if (
        Array.isArray(cmd) &&
        ((cmd[0] === "bun" && (cmd[1] === "update" || cmd[1] === "add")) || (cmd[0] === "git" && cmd[1] === "init"))
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
      expect(command.getName()).toBe("app:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Create a new application");
    });
  });

  describe("run()", () => {
    test("should generate root configuration files", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      expect(await exists(join(testDir, ".commitlintrc.ts"))).toBe(true);
      expect(await exists(join(testDir, ".gitignore"))).toBe(true);
      expect(await exists(join(testDir, "biome.jsonc"))).toBe(true);
      expect(await exists(join(testDir, "package.json"))).toBe(true);
      expect(await exists(join(testDir, "README.md"))).toBe(true);
      expect(await exists(join(testDir, "tsconfig.json"))).toBe(true);
      expect(await exists(join(testDir, ".zed", "settings.json"))).toBe(true);
    });

    test("should not generate bunfig.toml", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      expect(await exists(join(testDir, "bunfig.toml"))).toBe(false);
    });

    test("should generate husky hooks", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      expect(await exists(join(testDir, ".husky", "commit-msg"))).toBe(true);
      expect(await exists(join(testDir, ".husky", "pre-commit"))).toBe(true);
    });

    test("should replace {{NAME}} in package.json with kebab-case name", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      const content = await Bun.file(join(testDir, "package.json")).text();
      expect(content).toContain('"my-app"');
      expect(content).not.toContain("{{NAME}}");
    });

    test("should include scripts in root package.json", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      const pkg = await Bun.file(join(testDir, "package.json")).json();
      expect(pkg.scripts).toBeDefined();
      expect(pkg.scripts.fmt).toBeDefined();
      expect(pkg.scripts.lint).toBeDefined();
      expect(pkg.scripts.test).toBeDefined();
      expect(pkg.scripts.check).toBeDefined();
      expect(pkg.scripts.commit).toBeDefined();
    });

    test("should set check script to install, build, lint, and test", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      const pkg = await Bun.file(join(testDir, "package.json")).json();
      expect(pkg.scripts.check).toBe("bun run lint && bun run test");
    });

    test("should include workspaces pointing to modules/* in root package.json", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      const pkg = await Bun.file(join(testDir, "package.json")).json();
      expect(pkg.workspaces).toEqual(["modules/*"]);
    });

    test("should include lint-staged in root package.json", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      const pkg = await Bun.file(join(testDir, "package.json")).json();
      expect(pkg["lint-staged"]).toBeDefined();
    });

    test("should merge scripts, workspaces, and lint-staged into package.json when fields are missing", async () => {
      // Simulate a package.json that bun add may have rewritten without those fields
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "my-app" }, null, 2));

      // bunx husky init (not mocked in beforeEach) adds scripts.prepare to package.json,
      // which makes scripts defined and causes ??= to skip the merge — intercept it here.
      const savedSpawn = Bun.spawn;
      Bun.spawn = ((...args: unknown[]) => {
        const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;
        if (Array.isArray(cmd) && cmd[0] === "bunx") {
          return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
        }
        return savedSpawn.apply(Bun, args as Parameters<typeof Bun.spawn>);
      }) as typeof Bun.spawn;

      try {
        await command.run({ name: "MyApp", destination: testDir });
      } finally {
        Bun.spawn = savedSpawn;
      }

      const pkg = await Bun.file(join(testDir, "package.json")).json();
      expect(pkg.scripts).toBeDefined();
      expect(pkg.scripts.check).toBe("bun run lint && bun run test");
      expect(pkg.workspaces).toEqual(["modules/*"]);
      expect(pkg["lint-staged"]).toBeDefined();
    });

    test("should replace {{NAME}} in README.md with kebab-case name", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      const content = await Bun.file(join(testDir, "README.md")).text();
      expect(content).toContain("# my-app");
      expect(content).not.toContain("{{NAME}}");
    });

    test("should generate app module structure", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      expect(await exists(join(testDir, "modules", "app", "src", "AppModule.ts"))).toBe(true);
      expect(await exists(join(testDir, "modules", "app", "package.json"))).toBe(true);
      expect(await exists(join(testDir, "modules", "app", "tsconfig.json"))).toBe(true);
      expect(await exists(join(testDir, "modules", "app", "tests", "AppModule.spec.ts"))).toBe(true);
    });

    test("should set app module yml type to api", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      const content = await Bun.file(join(testDir, "modules", "app", "app.yml")).text();
      expect(content).toContain('type: "api"');
      expect(content).not.toContain('type: "module"');
    });

    test("should not add dev, stop, and build scripts to app module package.json", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      const content = await Bun.file(join(testDir, "modules", "app", "package.json")).json();
      expect(content.scripts.dev).toBeUndefined();
      expect(content.scripts.stop).toBeUndefined();
      expect(content.scripts.build).toBeUndefined();
    });

    test("should generate environment files", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      expect(await exists(join(testDir, ".env.yml"))).toBe(true);
      expect(await exists(join(testDir, "modules", "shared", ".env.yml"))).toBe(false);
    });

    test("should populate .env with default values", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      const content = await Bun.file(join(testDir, ".env.yml")).text();
      expect(content).toContain("postgresql://talos:talos@localhost:5432/talos");
      expect(content).toContain("redis://localhost:6379");
    });

    test("should write .env.yml in block-style YAML format", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      const content = await Bun.file(join(testDir, ".env.yml")).text();
      expect(content).not.toMatch(/^\{/);
      expect(content).toMatch(/^app:$/m);
      expect(content).toMatch(/^database:$/m);
      expect(content).toMatch(/^cache:$/m);
      expect(content).toMatch(/^ {2}url:/m);
    });

    test('should write empty string values as quoted "" in .env.yml', async () => {
      await command.run({ name: "MyApp", destination: testDir });

      const content = await Bun.file(join(testDir, ".env.yml")).text();
      expect(content).toContain('host: ""');
      expect(content).toContain('database_url: ""');
      expect(content).toContain('source_token: ""');
    });

    test("should generate Docker files with snake_case name", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      const dockerfile = await Bun.file(join(testDir, "modules", "app", "Dockerfile")).text();
      expect(dockerfile).toContain("my_app");
      expect(dockerfile).not.toContain("{{NAME}}");

      const compose = await Bun.file(join(testDir, "modules", "app", "docker-compose.yml")).text();
      expect(compose).toContain("my_app");
      expect(compose).not.toContain("{{NAME}}");
    });

    test("should generate index file in app module", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      expect(await exists(join(testDir, "modules", "app", "src", "index.ts"))).toBe(true);
    });

    test("should generate OnAppStart file in app module", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      const onAppStartPath = join(testDir, "modules", "app", "src", "OnAppStart.ts");
      expect(await exists(onAppStartPath)).toBe(true);

      const content = await Bun.file(onAppStartPath).text();
      expect(content).toContain("@decorator.app.event.start()");
      expect(content).toContain("class OnAppStart implements IAppEventStart");
    });

    test("should generate shared module with database file", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      expect(await exists(join(testDir, "modules", "shared", "src", "SharedModule.ts"))).toBe(true);
      expect(await exists(join(testDir, "modules", "shared", "package.json"))).toBe(true);
      expect(await exists(join(testDir, "modules", "shared", "tsconfig.json"))).toBe(true);
      expect(await exists(join(testDir, "modules", "shared", "src", "databases", "SharedDatabase.ts"))).toBe(true);
    });

    test("should generate roles.yml in shared module", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      expect(await exists(join(testDir, "modules", "shared", "src", "roles.yml"))).toBe(true);
    });

    test("should write roles.yml in block-style YAML format", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      const content = await Bun.file(join(testDir, "modules", "shared", "src", "roles.yml")).text();
      expect(content).not.toMatch(/^\{/);
      expect(content).toMatch(/^roles:$/m);
      expect(content).toMatch(/^hierarchy:$/m);
      expect(content).toMatch(/^ {2}ROLE_GUEST:/m);
    });

    test("should write roles.yml with role entries", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      const content = await Bun.file(join(testDir, "modules", "shared", "src", "roles.yml")).text();
      expect(content).toContain("ROLE_GUEST");
      expect(content).toContain("ROLE_ADMIN");
      expect(content).toContain("ROLE_SUPER_ADMIN");
    });

    test("should write roles.yml with hierarchy inherits as block list", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      const content = await Bun.file(join(testDir, "modules", "shared", "src", "roles.yml")).text();
      expect(content).toMatch(/inherits:\n {6}- ROLE_/m);
    });

    test("should generate var directory with .gitkeep", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      expect(await exists(join(testDir, "modules", "app", "var", ".gitkeep"))).toBe(true);
    });

    test("should generate root var directory with .gitkeep", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      expect(await exists(join(testDir, "var", ".gitkeep"))).toBe(true);
    });

    test("should add app scope to commitlint config", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      const content = await Bun.file(join(testDir, ".commitlintrc.ts")).text();
      expect(content).toContain('"app"');
      expect(content).toContain('"common"');
    });

    test("should install @talosjs/command as dev dependency", async () => {
      const spawnCalls: string[][] = [];

      Bun.spawn = ((...args: unknown[]) => {
        const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;
        if (Array.isArray(cmd)) {
          spawnCalls.push([...(cmd as string[])]);
        }
        return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
      }) as typeof Bun.spawn;

      await command.run({ name: "MyApp", destination: testDir });

      const devDepsCall = spawnCalls.find(
        (cmd) => cmd[0] === "bun" && cmd[1] === "add" && cmd[2] === "-D" && cmd.includes("@talosjs/command"),
      );
      expect(devDepsCall).toBeDefined();
      expect(devDepsCall).toContain("@talosjs/command");
    });

    test("should install dependencies silently without inheriting output", async () => {
      const spawnOpts: { cmd: string[]; stderr: unknown }[] = [];

      Bun.spawn = ((...args: unknown[]) => {
        const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;
        const opts = args[1] as { stderr?: unknown } | undefined;
        if (Array.isArray(cmd)) {
          spawnOpts.push({ cmd: [...(cmd as string[])], stderr: opts?.stderr });
        }
        return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
      }) as typeof Bun.spawn;

      await command.run({ name: "MyApp", destination: testDir });

      const installCalls = spawnOpts.filter((call) => call.cmd[0] === "bun" && call.cmd[1] === "add");
      expect(installCalls.length).toBeGreaterThan(0);
      for (const call of installCalls) {
        expect(call.stderr).toBe("pipe");
      }
    });

    test("should not install @nx/js, @nx/workspace, @swc-node/register, @swc/core, @swc/helpers as dev dependencies", async () => {
      const spawnCalls: string[][] = [];

      Bun.spawn = ((...args: unknown[]) => {
        const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;
        if (Array.isArray(cmd)) {
          spawnCalls.push([...(cmd as string[])]);
        }
        return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
      }) as typeof Bun.spawn;

      await command.run({ name: "MyApp", destination: testDir });

      const devDepsCall = spawnCalls.find(
        (cmd) => cmd[0] === "bun" && cmd[1] === "add" && cmd[2] === "-D" && cmd.includes("@talosjs/command"),
      );
      expect(devDepsCall).toBeDefined();
      expect(devDepsCall).not.toContain("@nx/js");
      expect(devDepsCall).not.toContain("@nx/workspace");
      expect(devDepsCall).not.toContain("@swc-node/register");
      expect(devDepsCall).not.toContain("@swc/core");
      expect(devDepsCall).not.toContain("@swc/helpers");
    });

    test("should display next steps after creation", async () => {
      await command.run({ name: "MyApp", destination: testDir });

      const messages = infoSpy.mock.calls.map((call) => call[0] as string);
      expect(messages.some((msg) => msg.includes(`cd ${testDir}`))).toBe(true);
      expect(messages.some((msg) => msg.includes("talos app:start"))).toBe(true);
      expect(messages.some((msg) => msg.includes("talos app:stop"))).toBe(true);
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
    });

    test("should create renovate.json when github is selected", async () => {
      createCiCdConfirm = true;
      ciProvider = "github";
      await command.run({ name: "MyApp", destination: testDir });

      expect(await exists(join(testDir, "renovate.json"))).toBe(true);
    });

    test("renovate.json should contain valid Renovate configuration", async () => {
      createCiCdConfirm = true;
      ciProvider = "github";
      await command.run({ name: "MyApp", destination: testDir });

      const content = await Bun.file(join(testDir, "renovate.json")).json();
      expect(content.$schema).toContain("renovate-schema.json");
      expect(content.extends).toContain("config:recommended");
      expect(Array.isArray(content.packageRules)).toBe(true);
    });

    test("should replace {{NAME}} in GitHub production workflow with snake_case name", async () => {
      createCiCdConfirm = true;
      ciProvider = "github";
      await command.run({ name: "MyApp", destination: testDir });

      const content = await Bun.file(join(testDir, ".github", "workflows", "production.yml")).text();
      expect(content).toContain("my_app");
      expect(content).not.toContain("{{NAME}}");
    });

    test("should not create GitLab or Bitbucket files when github is selected", async () => {
      createCiCdConfirm = true;
      ciProvider = "github";
      await command.run({ name: "MyApp", destination: testDir });

      expect(await exists(join(testDir, ".gitlab-ci.yml"))).toBe(false);
      expect(await exists(join(testDir, "bitbucket-pipelines.yml"))).toBe(false);
    });

    test("should create renovate.json when gitlab is selected", async () => {
      createCiCdConfirm = true;
      ciProvider = "gitlab";
      await command.run({ name: "MyApp", destination: testDir });

      expect(await exists(join(testDir, "renovate.json"))).toBe(true);
    });

    test("gitlab renovate.json should contain valid Renovate configuration", async () => {
      createCiCdConfirm = true;
      ciProvider = "gitlab";
      await command.run({ name: "MyApp", destination: testDir });

      const content = await Bun.file(join(testDir, "renovate.json")).json();
      expect(content.$schema).toContain("renovate-schema.json");
      expect(content.extends).toContain("config:recommended");
      expect(Array.isArray(content.packageRules)).toBe(true);
    });

    test("should create renovate.json when bitbucket is selected", async () => {
      createCiCdConfirm = true;
      ciProvider = "bitbucket";
      await command.run({ name: "MyApp", destination: testDir });

      expect(await exists(join(testDir, "renovate.json"))).toBe(true);
    });

    test("bitbucket renovate.json should contain valid Renovate configuration", async () => {
      createCiCdConfirm = true;
      ciProvider = "bitbucket";
      await command.run({ name: "MyApp", destination: testDir });

      const content = await Bun.file(join(testDir, "renovate.json")).json();
      expect(content.$schema).toContain("renovate-schema.json");
      expect(content.extends).toContain("config:recommended");
      expect(Array.isArray(content.packageRules)).toBe(true);
    });

    test("should create GitLab pipeline files when gitlab is selected", async () => {
      createCiCdConfirm = true;
      ciProvider = "gitlab";
      await command.run({ name: "MyApp", destination: testDir });

      expect(await exists(join(testDir, ".gitlab-ci.yml"))).toBe(true);
      expect(await exists(join(testDir, ".gitlab", "ci", "ci.yml"))).toBe(true);
      expect(await exists(join(testDir, ".gitlab", "ci", "production.yml"))).toBe(true);
    });

    test("should create .gitlab-ci.yml with correct includes", async () => {
      createCiCdConfirm = true;
      ciProvider = "gitlab";
      await command.run({ name: "MyApp", destination: testDir });

      const content = await Bun.file(join(testDir, ".gitlab-ci.yml")).text();
      expect(content).toContain(".gitlab/ci/ci.yml");
      expect(content).toContain(".gitlab/ci/production.yml");
    });

    test("should replace {{NAME}} in GitLab production pipeline with snake_case name", async () => {
      createCiCdConfirm = true;
      ciProvider = "gitlab";
      await command.run({ name: "MyApp", destination: testDir });

      const content = await Bun.file(join(testDir, ".gitlab", "ci", "production.yml")).text();
      expect(content).toContain("my_app");
      expect(content).not.toContain("{{NAME}}");
    });

    test("should not create GitHub or Bitbucket files when gitlab is selected", async () => {
      createCiCdConfirm = true;
      ciProvider = "gitlab";
      await command.run({ name: "MyApp", destination: testDir });

      expect(await exists(join(testDir, ".github", "workflows", "ci.yml"))).toBe(false);
      expect(await exists(join(testDir, "bitbucket-pipelines.yml"))).toBe(false);
    });

    test("should create bitbucket-pipelines.yml when bitbucket is selected", async () => {
      createCiCdConfirm = true;
      ciProvider = "bitbucket";
      await command.run({ name: "MyApp", destination: testDir });

      expect(await exists(join(testDir, "bitbucket-pipelines.yml"))).toBe(true);
    });

    test("should replace {{NAME}} in Bitbucket pipelines with snake_case name", async () => {
      createCiCdConfirm = true;
      ciProvider = "bitbucket";
      await command.run({ name: "MyApp", destination: testDir });

      const content = await Bun.file(join(testDir, "bitbucket-pipelines.yml")).text();
      expect(content).toContain("my_app");
      expect(content).not.toContain("{{NAME}}");
    });

    test("should not create GitHub or GitLab files when bitbucket is selected", async () => {
      createCiCdConfirm = true;
      ciProvider = "bitbucket";
      await command.run({ name: "MyApp", destination: testDir });

      expect(await exists(join(testDir, ".github", "workflows", "ci.yml"))).toBe(false);
      expect(await exists(join(testDir, ".gitlab-ci.yml"))).toBe(false);
    });
  });
});
