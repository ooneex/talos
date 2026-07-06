import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({})),
}));

const { BuildCommand } = await import("@/commands/BuildCommand");
const { FmtCommand } = await import("@/commands/FmtCommand");
const { LintCommand } = await import("@/commands/LintCommand");
const { TestCommand } = await import("@/commands/TestCommand");
const { MonorepoRunCommand } = await import("@/commands/MonorepoRunCommand");

type PackageJsonShapeType = {
  name: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
};

// Each alias pins `monorepo:run` to a single script; the alias' `name` doubles as
// both the CLI command and the script it runs, so one table drives every case.
const ALIASES = [
  { Command: BuildCommand, name: "build" },
  { Command: FmtCommand, name: "fmt" },
  { Command: LintCommand, name: "lint" },
  { Command: TestCommand, name: "test" },
] as const;

describe("script alias commands", () => {
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

  // Give both targets a script for every alias, appending to a per-script log so
  // tests can assert which targets ran.
  const scriptsFor = (label: string): Record<string, string> =>
    Object.fromEntries(ALIASES.map(({ name }) => [name, `echo ${label} >> ../../${name}.log`]));

  beforeEach(async () => {
    // The underlying runner streams its progress to `process.stdout`. Swallow it
    // here so those lines don't interleave with the test reporter's output.
    stdoutSpy = spyOn(process.stdout, "write").mockReturnValue(true);
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `script-alias-${Date.now()}-${Math.floor(Math.random() * 10000)}`);

    await writeTarget("packages/alpha", { name: "@test/alpha", scripts: scriptsFor("alpha") });
    await writeTarget("packages/beta", {
      name: "@test/beta",
      dependencies: { "@test/alpha": "workspace:^" },
      scripts: scriptsFor("beta"),
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

  for (const { Command, name } of ALIASES) {
    describe(`${name}`, () => {
      test(`should expose \`${name}\` as its name`, () => {
        expect(new Command().getName()).toBe(name);
      });

      test("should describe itself as a monorepo:run alias", () => {
        expect(new Command().getDescription()).toBe(
          `Alias for monorepo:run --commands=${name} — run the ${name} script across packages and modules with granular caching`,
        );
      });

      test(`should forward options to monorepo:run pinned to --commands=${name}`, async () => {
        const runSpy = spyOn(MonorepoRunCommand.prototype, "run").mockResolvedValue(undefined);

        await new Command().run({ packages: "beta", modules: "gamma", logs: true, noCache: true });

        expect(runSpy).toHaveBeenCalledTimes(1);
        expect(runSpy).toHaveBeenCalledWith({
          packages: "beta",
          modules: "gamma",
          logs: true,
          noCache: true,
          commands: name,
        });

        runSpy.mockRestore();
      });

      test(`should run only the ${name} script across every target`, async () => {
        await writeRootPackageJson();

        await new Command().run({ logs: true });

        expect(process.exitCode ?? 0).toBe(0);
        expect((await readLines(`${name}.log`)).sort()).toEqual(["alpha", "beta"]);
        // The sibling scripts stay untouched.
        for (const other of ALIASES.filter((entry) => entry.name !== name)) {
          expect(await readLines(`${other.name}.log`)).toEqual([]);
        }
      });

      test("should only run the selected package", async () => {
        await writeRootPackageJson();

        await new Command().run({ packages: "beta", logs: true });

        expect((await readLines(`${name}.log`)).sort()).toEqual(["beta"]);
      });
    });
  }
});
