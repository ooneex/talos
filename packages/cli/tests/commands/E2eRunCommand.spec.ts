import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({})),
}));

const { E2eRunCommand } = await import("@/commands/E2eRunCommand");
const { MonorepoRunCommand } = await import("@/commands/MonorepoRunCommand");

type PackageJsonShapeType = {
  name: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
};

describe("E2eRunCommand", () => {
  let command: InstanceType<typeof E2eRunCommand>;
  let testDir: string;
  let originalCwd: string;
  let stdoutSpy: ReturnType<typeof spyOn>;

  const writeTarget = async (base: string, packageJson: PackageJsonShapeType): Promise<void> => {
    await Bun.write(join(testDir, base, "package.json"), JSON.stringify(packageJson, null, 2));
    await Bun.write(join(testDir, base, "src", "index.ts"), `export const name = "${packageJson.name}";\n`);
  };

  const readLines = async (name: string): Promise<string[]> => {
    const file = Bun.file(join(testDir, name));
    if (!(await file.exists())) return [];
    return (await file.text()).split("\n").filter(Boolean);
  };

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

  beforeEach(async () => {
    // The underlying runner streams its progress to `process.stdout`. Swallow it
    // here so those lines don't interleave with the test reporter's output.
    stdoutSpy = spyOn(process.stdout, "write").mockReturnValue(true);
    command = new E2eRunCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `e2e-run-${Date.now()}-${Math.floor(Math.random() * 10000)}`);

    await writeTarget("packages/alpha", {
      name: "@test/alpha",
      scripts: { e2e: "echo alpha >> ../../e2e.log", build: "echo alpha >> ../../build.log" },
    });
    await writeTarget("packages/beta", {
      name: "@test/beta",
      dependencies: { "@test/alpha": "workspace:^" },
      scripts: { e2e: "echo beta >> ../../e2e.log", build: "echo beta >> ../../build.log" },
    });

    process.chdir(testDir);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Command Metadata", () => {
    test("should expose `e2e:run` as its name", () => {
      expect(command.getName()).toBe("e2e:run");
    });

    test("should describe itself as a monorepo:run alias", () => {
      expect(command.getDescription()).toBe(
        "Alias for monorepo:run --commands=e2e — run the e2e script across packages and modules with granular caching",
      );
    });
  });

  describe("run()", () => {
    test("should forward options to monorepo:run pinned to --commands=e2e", async () => {
      const runSpy = spyOn(MonorepoRunCommand.prototype, "run").mockResolvedValue(undefined);

      await command.run({ packages: "beta", modules: "gamma", logs: true, noCache: true });

      expect(runSpy).toHaveBeenCalledTimes(1);
      expect(runSpy).toHaveBeenCalledWith({
        packages: "beta",
        modules: "gamma",
        logs: true,
        noCache: true,
        commands: "e2e",
      });

      runSpy.mockRestore();
    });

    test("should run only the e2e script across every target", async () => {
      await writeRootPackageJson();

      await command.run({ logs: true });

      expect(process.exitCode ?? 0).toBe(0);
      expect((await readLines("e2e.log")).sort()).toEqual(["alpha", "beta"]);
      // The sibling scripts stay untouched.
      expect(await readLines("build.log")).toEqual([]);
    });

    test("should only run the selected package", async () => {
      await writeRootPackageJson();

      await command.run({ packages: "beta", logs: true });

      expect((await readLines("e2e.log")).sort()).toEqual(["beta"]);
    });
  });
});
