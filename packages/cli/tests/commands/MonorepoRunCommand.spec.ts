import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
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
  let stdoutSpy: ReturnType<typeof spyOn>;
  let stdoutChunks: string[];

  // Everything the command wrote to stdout, ANSI colors stripped, as one string.
  // The class allows any non-`m` byte (not just `[0-9;]`) because Bun's low-depth
  // "ansi" encoding can emit a malformed sequence with a stray byte, e.g.
  // \x1b[38;5;\nm, in 16-color terminals like CI.
  const ansiRegex = new RegExp(`${String.fromCharCode(27)}\\[[^m]*m`, "g");
  const output = (): string => stdoutChunks.join("").replace(ansiRegex, "");

  const writeTarget = async (base: string, packageJson: PackageJsonShapeType): Promise<void> => {
    await Bun.write(join(testDir, base, "package.json"), JSON.stringify(packageJson, null, 2));
    await Bun.write(join(testDir, base, "src", "index.ts"), `export const name = "${packageJson.name}";\n`);
    // A target with a `test` script needs at least one file under `tests/`, or
    // the run skips it as having nothing to test.
    if (packageJson.scripts?.test !== undefined) {
      await Bun.write(join(testDir, base, "tests", "index.spec.ts"), "export {};\n");
    }
  };

  const readLines = async (name: string): Promise<string[]> => {
    const file = Bun.file(join(testDir, name));
    if (!(await file.exists())) return [];
    return (await file.text()).split("\n").filter(Boolean);
  };

  beforeEach(async () => {
    // The command under test streams its progress to `process.stdout`. Capture
    // it here (instead of letting it through) so those lines don't interleave
    // with the test reporter's output — e.g. when `oo monorepo:run
    // --commands=…,test` runs this very suite — while still letting tests assert
    // on what was logged via `output()`.
    stdoutChunks = [];
    stdoutSpy = spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array): boolean => {
      stdoutChunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
      return true;
    });
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
    stdoutSpy.mockRestore();
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

    // Each task writes a live marker on entry, sleeps, then records whether any
    // other task's marker was present before clearing its own. An overlapping
    // marker can only be observed if two tasks are alive at once, so a `saw-*`
    // file proves the independent tasks ran concurrently rather than serially.
    test("should run independent tasks in parallel", async () => {
      const solo = (name: string): string =>
        `bun -e "const fs=require('fs');fs.writeFileSync('../../run-${name}','');Bun.sleepSync(150);` +
        `const others=fs.readdirSync('../..').filter(f=>f.startsWith('run-')&&f!=='run-${name}');` +
        `if(others.length)fs.writeFileSync('../../saw-${name}','');fs.unlinkSync('../../run-${name}');` +
        `fs.writeFileSync('../../done-${name}','ok');"`;
      await writeTarget("packages/one", { name: "@test/one", scripts: { build: solo("one") } });
      await writeTarget("packages/two", { name: "@test/two", scripts: { build: solo("two") } });

      await command.run({ commands: "build", packages: "one,two", logs: true });

      expect(process.exitCode ?? 0).toBe(0);
      expect(existsSync(join(testDir, "done-one"))).toBe(true);
      expect(existsSync(join(testDir, "done-two"))).toBe(true);
      // At least one task saw the other alive: the two ran at the same time.
      expect(existsSync(join(testDir, "saw-one")) || existsSync(join(testDir, "saw-two"))).toBe(true);
    });

    // `fmt` and `lint` only read a target's own files, so their tasks carry no
    // workspace-dependency edges: a dependent starts without waiting for its
    // dependency's task. Reusing the overlap-marker technique above, `app`
    // depends on `lib` yet the two run at the same time — which the kept edge
    // (see the `build` ordering test) would forbid.
    for (const cmd of ["fmt", "lint"] as const) {
      test(`should not order a dependent after its dependency for ${cmd}`, async () => {
        const solo = (name: string): string =>
          `bun -e "const fs=require('fs');fs.writeFileSync('../../run-${name}','');Bun.sleepSync(150);` +
          `const others=fs.readdirSync('../..').filter(f=>f.startsWith('run-')&&f!=='run-${name}');` +
          `if(others.length)fs.writeFileSync('../../saw-${name}','');fs.unlinkSync('../../run-${name}');"`;
        await writeTarget("packages/lib", { name: "@test/lib", scripts: { [cmd]: solo("lib") } });
        await writeTarget("packages/app", {
          name: "@test/app",
          dependencies: { "@test/lib": "workspace:^" },
          scripts: { [cmd]: solo("app") },
        });

        await command.run({ commands: cmd, packages: "lib,app", logs: true });

        expect(process.exitCode ?? 0).toBe(0);
        // If the edge were kept, `lib` would finish before `app` began and
        // neither would ever observe the other's marker.
        expect(existsSync(join(testDir, "saw-lib")) || existsSync(join(testDir, "saw-app"))).toBe(true);
      });
    }

    test("should skip targets without the script and not fail", async () => {
      await command.run({ commands: "lint", logs: true });

      expect(process.exitCode ?? 0).toBe(0);
      expect(await readLines("lint.log")).toEqual(["alpha"]);
    });

    test("should skip the test task when the target has an empty tests folder", async () => {
      // A `test` script but no test files: the folder is empty, so nothing runs.
      await writeTarget("packages/empty", {
        name: "@test/empty",
        scripts: { test: "echo empty >> ../../test.log" },
      });
      rmSync(join(testDir, "packages", "empty", "tests"), { recursive: true, force: true });

      await command.run({ commands: "test", packages: "empty", logs: true });

      expect(process.exitCode ?? 0).toBe(0);
      expect(await readLines("test.log")).toEqual([]);
      expect(output()).toContain("1 skipped");
    });

    test("should run the test task when the tests folder has files", async () => {
      // `writeTarget` creates a `tests/` file for any target with a test script.
      await writeTarget("packages/tested", {
        name: "@test/tested",
        scripts: { test: "echo tested >> ../../test.log" },
      });

      await command.run({ commands: "test", packages: "tested", logs: true });

      expect(process.exitCode ?? 0).toBe(0);
      expect(await readLines("test.log")).toEqual(["tested"]);
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

  describe("logging", () => {
    test("should log successful tasks with their duration", async () => {
      await command.run({ commands: "build", logs: true });

      const logged = output();
      expect(process.exitCode ?? 0).toBe(0);
      // The header and closing summary frame the run.
      expect(logged).toContain("build  3 tasks across 3 targets");
      expect(logged).toContain("Ran build");
      // Each successful task gets its own ✔ line.
      expect(logged).toContain("alpha:build");
      expect(logged).toContain("beta:build");
      expect(logged).toContain("billing:build");
      // No per-task "started" chatter and nothing marked failed.
      expect(logged).not.toContain("started");
      expect(logged).not.toContain("failed");
    });

    test("should not log skipped or cached tasks", async () => {
      // beta and billing have no "lint" script (skipped); alpha:lint succeeds
      // and is logged on the first run.
      await command.run({ commands: "lint", logs: true });
      expect(output()).toContain("alpha:lint");

      // A second identical run turns alpha:lint into a cache hit. Inspect only
      // this run's output.
      stdoutChunks.length = 0;
      await command.run({ commands: "lint", logs: true });

      const logged = output();
      // Cached (alpha) and skipped (beta, billing) tasks produce no per-task line.
      expect(logged).not.toContain("alpha:lint");
      expect(logged).not.toContain('no "lint" script');
      // Their counts still show up in the closing summary, though.
      expect(logged).toContain("2 skipped");
      expect(logged).toContain("1 cached");
    });

    test("should log a failed task with its failure excerpt", async () => {
      await writeTarget("packages/gamma", {
        name: "@test/gamma",
        scripts: { build: 'echo "error: boom happened" >&2 && exit 1' },
      });

      await command.run({ commands: "build", packages: "gamma", logs: true });

      const logged = output();
      expect(process.exitCode).toBe(1);
      // The failed task is announced with its exit status...
      expect(logged).toContain("gamma:build");
      expect(logged).toContain("failed");
      // ...and its captured output is surfaced as a ┃-prefixed excerpt.
      expect(logged).toContain("error: boom happened");
    });

    test("should strip passing-test noise from the failure excerpt", async () => {
      // Mimic a `bun test` run: one real failure surrounded by many `(pass)`
      // lines whose descriptions mention words ("throw", "exception") that would
      // otherwise be mistaken for failure signals. One `echo` per line so the
      // captured output has real newlines.
      const report = [
        "error: boom",
        "(fail) createAdapter > should build an adapter [1.42ms]",
        "(pass) buildMessages > should throw on bad input [0.03ms]",
        "(pass) AiException > should expose the exception name [0.02ms]",
        "(pass) tool > should report a failed deletion [0.01ms]",
        "1 tests failed:",
        " 137 pass",
        " 1 fail",
      ];
      const script = `${report.map((line) => `echo ${JSON.stringify(line)} >&2`).join("; ")}; exit 1`;
      await writeTarget("packages/gamma", {
        name: "@test/gamma",
        scripts: { build: script },
      });

      await command.run({ commands: "build", packages: "gamma", logs: true });

      const logged = output();
      expect(process.exitCode).toBe(1);
      // The real failure and the summary counts survive...
      expect(logged).toContain("error: boom");
      expect(logged).toContain("(fail) createAdapter");
      expect(logged).toContain("1 tests failed:");
      expect(logged).toContain("137 pass");
      // ...but none of the passing-test lines are echoed.
      expect(logged).not.toContain("(pass)");
      expect(logged).not.toContain("buildMessages");
      expect(logged).not.toContain("AiException");
    });

    test("should drop bare caret pointer lines from the failure excerpt", async () => {
      // A code-frame caret is meaningless without the source line it points at.
      const report = ["error: assertion failed", "                    ^", "  expected 1 to be 2"];
      const script = `${report.map((line) => `echo ${JSON.stringify(line)} >&2`).join("; ")}; exit 1`;
      await writeTarget("packages/gamma", {
        name: "@test/gamma",
        scripts: { build: script },
      });

      await command.run({ commands: "build", packages: "gamma", logs: true });

      const logged = output();
      expect(process.exitCode).toBe(1);
      expect(logged).toContain("error: assertion failed");
      expect(logged).toContain("expected 1 to be 2");
      // The lone `┃ ^` pointer line is gone.
      expect(logged).not.toMatch(/┃ +\^\s*\n/);
    });

    test("should collapse gaps to a single … with no stray blank lines", async () => {
      // Two failure blocks separated by irrelevant `(pass)` chatter and blanks.
      // The excerpt should bridge them with exactly one … and no orphaned blanks.
      const report = [
        "error: first failure",
        "",
        "(pass) something > should throw when unhappy [0.01ms]",
        "(pass) another > raises an exception [0.02ms]",
        "",
        "1 tests failed:",
      ];
      const script = `${report.map((line) => `echo ${JSON.stringify(line)} >&2`).join("; ")}; exit 1`;
      await writeTarget("packages/gamma", {
        name: "@test/gamma",
        scripts: { build: script },
      });

      await command.run({ commands: "build", packages: "gamma", logs: true });

      const excerptLines = output()
        .split("\n")
        .filter((line) => line.trimStart().startsWith("┃"))
        .map((line) => line.replace(/^\s*┃ ?/, ""));
      // Both failure anchors are present, joined by exactly one … gap marker...
      expect(excerptLines).toContain("error: first failure");
      expect(excerptLines).toContain("1 tests failed:");
      expect(excerptLines.filter((line) => line === "…")).toHaveLength(1);
      // ...and no empty excerpt lines survive from the dropped noise/blanks.
      expect(excerptLines.filter((line) => line.trim() === "")).toHaveLength(0);
    });
  });
});
