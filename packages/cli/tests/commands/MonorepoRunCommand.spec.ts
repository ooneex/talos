import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
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
