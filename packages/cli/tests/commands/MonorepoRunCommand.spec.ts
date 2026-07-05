import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";

mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({})),
}));

const { MonorepoRunCommand } = await import("@/commands/MonorepoRunCommand");

type PackageJsonShapeType = {
  name: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
};

describe("MonorepoRunCommand", () => {
  let command: InstanceType<typeof MonorepoRunCommand>;
  let testDir: string;
  let originalCwd: string;

  const writeTarget = async (base: string, packageJson: PackageJsonShapeType): Promise<void> => {
    await Bun.write(join(testDir, base, "package.json"), JSON.stringify(packageJson, null, 2));
    await Bun.write(join(testDir, base, "src", "index.ts"), `export const name = "${packageJson.name}";\n`);
  };

  const readLines = async (name: string): Promise<string[]> => {
    const file = Bun.file(join(testDir, name));
    if (!(await file.exists())) return [];
    return (await file.text()).split("\n").filter(Boolean);
  };

  beforeEach(async () => {
    command = new MonorepoRunCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `monorepo-run-${Date.now()}-${Math.floor(Math.random() * 10000)}`);

    await writeTarget("packages/alpha", {
      name: "@test/alpha",
      scripts: {
        build: "mkdir -p dist && echo built > dist/out.txt && echo alpha >> ../../order.log",
        lint: "echo alpha >> ../../lint.log",
      },
    });
    await writeTarget("packages/beta", {
      name: "@test/beta",
      dependencies: { "@test/alpha": "workspace:^" },
      scripts: { build: "echo beta >> ../../order.log" },
    });
    await writeTarget("modules/billing", {
      name: "@test/billing",
      scripts: { build: "echo billing >> ../../order.log" },
    });

    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("monorepo:run");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe(
        "Run package.json scripts across packages and modules with granular caching",
      );
    });
  });

  describe("run()", () => {
    test("should fail when --commands is missing", async () => {
      await command.run({ logs: true });

      expect(process.exitCode).toBe(1);
    });

    const writeRootPackageJson = async (): Promise<void> => {
      await Bun.write(
        join(testDir, "package.json"),
        JSON.stringify(
          { name: "root", version: "1.0.0", private: true, workspaces: ["packages/*", "modules/*"] },
          null,
          2,
        ),
      );
    };

    test("should run bun install at the project root for the install command", async () => {
      await writeRootPackageJson();

      await command.run({ commands: "install", logs: true });

      expect(process.exitCode ?? 0).toBe(0);
      // bun install ran at the root, producing a lockfile there.
      expect(existsSync(join(testDir, "bun.lock"))).toBe(true);
    });

    test("should run install before per-target commands", async () => {
      await writeRootPackageJson();

      await command.run({ commands: "install,build", logs: true });

      expect(process.exitCode ?? 0).toBe(0);
      expect(existsSync(join(testDir, "bun.lock"))).toBe(true);
      // The per-target build group still runs after install.
      expect((await readLines("order.log")).sort()).toEqual(["alpha", "beta", "billing"]);
    });

    test("should run the command across all packages and modules", async () => {
      await command.run({ commands: "build", logs: true });

      const order = await readLines("order.log");
      expect(process.exitCode ?? 0).toBe(0);
      expect(order.sort()).toEqual(["alpha", "beta", "billing"]);
    });

    test("should run dependencies before their dependents", async () => {
      await command.run({ commands: "build", logs: true });

      const order = await readLines("order.log");
      expect(order.indexOf("alpha")).toBeLessThan(order.indexOf("beta"));
    });

    // A mutual barrier: each task writes its own marker, then refuses to finish
    // until it sees the other's marker (giving up after a timeout). Both markers
    // can only appear if the two tasks are alive at the same time, so a clean run
    // proves they executed concurrently rather than one after another.
    test.skipIf(availableParallelism() < 2)("should run independent tasks in parallel", async () => {
      const barrier = (name: string, other: string): string =>
        `bun -e "const fs=require('fs');fs.writeFileSync('../../ready-${name}','');` +
        `const t=Date.now()+5000;while(!fs.existsSync('../../ready-${other}')){if(Date.now()>t)process.exit(1);Bun.sleepSync(15);}` +
        `fs.writeFileSync('../../done-${name}','ok');"`;
      await writeTarget("packages/one", { name: "@test/one", scripts: { build: barrier("one", "two") } });
      await writeTarget("packages/two", { name: "@test/two", scripts: { build: barrier("two", "one") } });

      await command.run({ commands: "build", packages: "one,two", logs: true });

      expect(process.exitCode ?? 0).toBe(0);
      expect(existsSync(join(testDir, "done-one"))).toBe(true);
      expect(existsSync(join(testDir, "done-two"))).toBe(true);
    });

    test("should skip targets without the script and not fail", async () => {
      await command.run({ commands: "lint", logs: true });

      expect(process.exitCode ?? 0).toBe(0);
      expect(await readLines("lint.log")).toEqual(["alpha"]);
    });

    test("should only run selected packages and modules", async () => {
      await command.run({ commands: "build", packages: "beta", modules: "billing", logs: true });

      expect((await readLines("order.log")).sort()).toEqual(["beta", "billing"]);
    });

    test("should fail on unknown package name", async () => {
      await command.run({ commands: "build", packages: "unknown", logs: true });

      expect(process.exitCode).toBe(1);
      expect(await readLines("order.log")).toEqual([]);
    });

    test("should not re-run tasks whose inputs are unchanged", async () => {
      await command.run({ commands: "build", logs: true });
      await command.run({ commands: "build", logs: true });

      expect(process.exitCode ?? 0).toBe(0);
      expect((await readLines("order.log")).sort()).toEqual(["alpha", "beta", "billing"]);
    });

    test("should save cache entries under var/cache/monorepo", async () => {
      await command.run({ commands: "build", logs: true });

      expect(existsSync(join(testDir, "var", "cache", "monorepo"))).toBe(true);
    });

    test("should restore output artifacts on cache hit", async () => {
      await command.run({ commands: "build", logs: true });

      rmSync(join(testDir, "packages", "alpha", "dist"), { recursive: true, force: true });
      await command.run({ commands: "build", logs: true });

      const restored = Bun.file(join(testDir, "packages", "alpha", "dist", "out.txt"));
      expect(await restored.exists()).toBe(true);
      expect((await restored.text()).trim()).toBe("built");
    });

    test("should re-run tasks when a source file changes", async () => {
      await command.run({ commands: "build", logs: true });
      await Bun.write(join(testDir, "packages", "alpha", "src", "index.ts"), "export const name = 'changed';\n");
      await command.run({ commands: "build", logs: true });

      const order = await readLines("order.log");
      // alpha re-runs, and beta re-runs because it depends on alpha.
      expect(order.filter((line) => line === "alpha")).toHaveLength(2);
      expect(order.filter((line) => line === "beta")).toHaveLength(2);
      expect(order.filter((line) => line === "billing")).toHaveLength(1);
    });

    test("should always run with --no-cache", async () => {
      await command.run({ commands: "build", noCache: true, logs: true });
      await command.run({ commands: "build", noCache: true, logs: true });

      expect((await readLines("order.log")).filter((line) => line === "alpha")).toHaveLength(2);
    });

    test("should stop everything when a command fails", async () => {
      await writeTarget("packages/gamma", {
        name: "@test/gamma",
        scripts: { build: "exit 1" },
      });

      await command.run({ commands: "build,lint", logs: true });

      expect(process.exitCode).toBe(1);
      // The lint group never starts once the build group failed.
      expect(await readLines("lint.log")).toEqual([]);
    });

    test("should not invalidate the cache when a task writes git-ignored files", async () => {
      // Make the workspace a git repository root so git-aware hashing is used.
      Bun.spawnSync(["git", "init", "-q"], { cwd: testDir });
      await Bun.write(join(testDir, ".gitignore"), "tmp/\n*.log\nnode_modules/\ndist/\nvar/\n");
      await writeTarget("packages/scratch", {
        name: "@test/scratch",
        scripts: {
          test: `bun -e "await Bun.write('tmp/' + Date.now() + '.txt', 'x')" && echo scratch >> ../../scratch.log`,
        },
      });

      await command.run({ commands: "test", packages: "scratch", logs: true });
      await command.run({ commands: "test", packages: "scratch", logs: true });

      expect(process.exitCode ?? 0).toBe(0);
      // The second run is a cache hit even though tmp/ gained a new random file.
      expect(await readLines("scratch.log")).toEqual(["scratch"]);
    });

    test("should not cache failed tasks", async () => {
      await writeTarget("packages/gamma", {
        name: "@test/gamma",
        scripts: { build: "echo gamma >> ../../gamma.log && exit 1" },
      });

      await command.run({ commands: "build", packages: "gamma", logs: true });
      process.exitCode = 0;
      await command.run({ commands: "build", packages: "gamma", logs: true });

      expect(process.exitCode).toBe(1);
      expect(await readLines("gamma.log")).toEqual(["gamma", "gamma"]);
    });
  });
});
