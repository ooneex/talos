import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({})),
}));

const { RunCommand } = await import("@/commands/RunCommand");
const { MonorepoRunCommand } = await import("@/commands/MonorepoRunCommand");

type PackageJsonShapeType = {
  name: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
};

describe("RunCommand", () => {
  let command: InstanceType<typeof RunCommand>;
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
    command = new RunCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `run-${Date.now()}-${Math.floor(Math.random() * 10000)}`);

    await writeTarget("packages/alpha", {
      name: "@test/alpha",
      scripts: { build: "echo alpha >> ../../build.log" },
    });
    await writeTarget("packages/beta", {
      name: "@test/beta",
      dependencies: { "@test/alpha": "workspace:^" },
      scripts: { build: "echo beta >> ../../build.log" },
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
    test("should expose `run` as its name", () => {
      expect(command.getName()).toBe("run");
    });

    test("should describe itself as an alias for monorepo:run", () => {
      expect(command.getDescription()).toBe(
        "Alias for monorepo:run — run package.json scripts across packages and modules with granular caching",
      );
    });
  });

  describe("run()", () => {
    test("should forward every option untouched to MonorepoRunCommand", async () => {
      const runSpy = spyOn(MonorepoRunCommand.prototype, "run").mockResolvedValue(undefined);

      const options = { commands: "build", packages: "beta", modules: "gamma", logs: true, noCache: true };
      await command.run(options);

      expect(runSpy).toHaveBeenCalledTimes(1);
      expect(runSpy).toHaveBeenCalledWith(options);

      runSpy.mockRestore();
    });

    test("should behave like monorepo:run end to end", async () => {
      await writeRootPackageJson();

      await command.run({ commands: "build", logs: true });

      expect(process.exitCode ?? 0).toBe(0);
      expect((await readLines("build.log")).sort()).toEqual(["alpha", "beta"]);
    });

    test("should build dependencies before their dependents", async () => {
      await writeRootPackageJson();

      await command.run({ commands: "build", logs: true });

      const build = await readLines("build.log");
      expect(build.indexOf("alpha")).toBeLessThan(build.indexOf("beta"));
    });

    test("should only run selected packages", async () => {
      await writeRootPackageJson();

      await command.run({ commands: "build", packages: "beta", logs: true });

      expect((await readLines("build.log")).sort()).toEqual(["beta"]);
    });
  });
});
