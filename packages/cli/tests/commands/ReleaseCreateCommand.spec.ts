import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

// Mock enquirer before importing command (askConfirm uses prompt from enquirer)
const mockPrompt = mock(() => Promise.resolve({ confirm: false }));
mock.module("enquirer", () => ({
  prompt: mockPrompt,
}));

const { ReleaseCreateCommand } = await import("@/commands/ReleaseCreateCommand");

describe("ReleaseCreateCommand", () => {
  let command: InstanceType<typeof ReleaseCreateCommand>;
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    command = new ReleaseCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `release-${Date.now()}`);
    // Mock getRepoUrl to return null for predictable changelog output
    // @ts-expect-error accessing private method for testing
    command.getRepoUrl = mock(() => Promise.resolve(null));
    // Assume a clean working tree unless a test overrides it
    // @ts-expect-error accessing private method for testing
    command.hasPendingChanges = mock(() => Promise.resolve(false));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("release:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Release packages with version bump, changelog, and git tag");
    });
  });

  describe("determineBumpType", () => {
    test("should return minor when feat commit exists", () => {
      const commits = [
        { hash: "abc12345", type: "feat", scope: "cli", subject: "Add new feature", author: "Test Author" },
        { hash: "def67890", type: "fix", scope: "cli", subject: "Fix bug", author: "Test Author" },
      ];
      // @ts-expect-error accessing private method for testing
      expect(command.determineBumpType(commits)).toBe("minor");
    });

    test("should return patch when only fix commits exist", () => {
      const commits = [
        { hash: "abc12345", type: "fix", scope: "cli", subject: "Fix bug", author: "Test Author" },
        { hash: "def67890", type: "chore", scope: "cli", subject: "Update deps", author: "Test Author" },
      ];
      // @ts-expect-error accessing private method for testing
      expect(command.determineBumpType(commits)).toBe("patch");
    });

    test("should return patch when no feat commits exist", () => {
      const commits = [
        { hash: "abc12345", type: "refactor", scope: "cli", subject: "Refactor code", author: "Test Author" },
        { hash: "def67890", type: "docs", scope: "cli", subject: "Update docs", author: "Test Author" },
      ];
      // @ts-expect-error accessing private method for testing
      expect(command.determineBumpType(commits)).toBe("patch");
    });

    test("should return major when a breaking commit exists", () => {
      const commits = [
        { hash: "abc12345", type: "feat", scope: "cli", subject: "New API", author: "Test Author", breaking: true },
        { hash: "def67890", type: "fix", scope: "cli", subject: "Fix bug", author: "Test Author" },
      ];
      // @ts-expect-error accessing private method for testing
      expect(command.determineBumpType(commits)).toBe("major");
    });

    test("should return major even when the breaking commit is not a feat", () => {
      const commits = [
        { hash: "abc12345", type: "fix", scope: "cli", subject: "Drop option", author: "Test Author", breaking: true },
      ];
      // @ts-expect-error accessing private method for testing
      expect(command.determineBumpType(commits)).toBe("major");
    });
  });

  describe("commit subject parsing", () => {
    test("should parse scoped, unscoped, and breaking subjects", () => {
      const conventionalRegex = /^([a-z]+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;

      const scoped = "fix(cli): handle null".match(conventionalRegex);
      expect(scoped?.[1]).toBe("fix");
      expect(scoped?.[2]).toBe("cli");
      expect(scoped?.[4]).toBe("handle null");

      const unscoped = "fix: handle null".match(conventionalRegex);
      expect(unscoped?.[1]).toBe("fix");
      expect(unscoped?.[2]).toBeUndefined();
      expect(unscoped?.[4]).toBe("handle null");

      const breaking = "feat(api)!: change response shape".match(conventionalRegex);
      expect(breaking?.[1]).toBe("feat");
      expect(breaking?.[2]).toBe("api");
      expect(breaking?.[3]).toBe("!");
      expect(breaking?.[4]).toBe("change response shape");

      const unscopedBreaking = "feat!: change response shape".match(conventionalRegex);
      expect(unscopedBreaking?.[1]).toBe("feat");
      expect(unscopedBreaking?.[3]).toBe("!");
    });
  });

  describe("bumpVersion", () => {
    test("should bump minor version and reset patch", () => {
      // @ts-expect-error accessing private method for testing
      expect(command.bumpVersion("1.2.3", "minor")).toBe("1.3.0");
    });

    test("should bump patch version", () => {
      // @ts-expect-error accessing private method for testing
      expect(command.bumpVersion("1.2.3", "patch")).toBe("1.2.4");
    });

    test("should handle version 0.0.0", () => {
      // @ts-expect-error accessing private method for testing
      expect(command.bumpVersion("0.0.0", "minor")).toBe("0.1.0");
      // @ts-expect-error accessing private method for testing
      expect(command.bumpVersion("0.0.0", "patch")).toBe("0.0.1");
    });

    test("should handle high version numbers", () => {
      // @ts-expect-error accessing private method for testing
      expect(command.bumpVersion("10.20.30", "minor")).toBe("10.21.0");
      // @ts-expect-error accessing private method for testing
      expect(command.bumpVersion("10.20.30", "patch")).toBe("10.20.31");
    });
  });

  describe("updateChangelog", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, ".gitkeep"), "");
    });

    test("should create new changelog when none exists", async () => {
      const commits = [
        { hash: "abc12345", type: "feat", scope: "cli", subject: "Add release command", author: "Test Author" },
      ];

      // @ts-expect-error accessing private method for testing
      await command.updateChangelog(testDir, "1.1.0", "v1.1.0", commits);

      const changelogPath = join(testDir, "CHANGELOG.md");
      expect(existsSync(changelogPath)).toBe(true);

      const content = await Bun.file(changelogPath).text();
      expect(content).toContain("# Changelog");
      expect(content).toContain("## [1.1.0]");
      expect(content).toContain("### Added");
      expect(content).toContain("- Add release command — Test Author");
    });

    test("should insert after Unreleased section in existing changelog", async () => {
      const existingChangelog = `# Changelog

## [Unreleased]

## [1.0.0] - 2025-01-01

### Added

- Initial release
`;
      await Bun.write(join(testDir, "CHANGELOG.md"), existingChangelog);

      const commits = [{ hash: "abc12345", type: "fix", scope: "cli", subject: "Fix a bug", author: "Test Author" }];

      // @ts-expect-error accessing private method for testing
      await command.updateChangelog(testDir, "1.0.1", "v1.0.1", commits);

      const content = await Bun.file(join(testDir, "CHANGELOG.md")).text();
      expect(content).toContain("## [Unreleased]");
      expect(content).toContain("## [1.0.1]");
      expect(content).toContain("### Fixed");
      expect(content).toContain("- Fix a bug — Test Author");
      expect(content).toContain("## [1.0.0] - 2025-01-01");

      const unreleasedIndex = content.indexOf("## [Unreleased]");
      const newVersionIndex = content.indexOf("## [1.0.1]");
      const oldVersionIndex = content.indexOf("## [1.0.0]");
      expect(unreleasedIndex).toBeLessThan(newVersionIndex);
      expect(newVersionIndex).toBeLessThan(oldVersionIndex);
    });

    test("should group commits by category", async () => {
      const commits = [
        { hash: "abc12345", type: "feat", scope: "cli", subject: "Add new feature", author: "Test Author" },
        { hash: "def67890", type: "fix", scope: "cli", subject: "Fix bug", author: "Test Author" },
        { hash: "ghi11111", type: "refactor", scope: "cli", subject: "Refactor code", author: "Test Author" },
        { hash: "jkl22222", type: "revert", scope: "cli", subject: "Revert change", author: "Test Author" },
      ];

      // @ts-expect-error accessing private method for testing
      await command.updateChangelog(testDir, "1.1.0", "v1.1.0", commits);

      const content = await Bun.file(join(testDir, "CHANGELOG.md")).text();
      expect(content).toContain("### Added");
      expect(content).toContain("- Add new feature — Test Author");
      expect(content).toContain("### Changed");
      expect(content).toContain("- Refactor code — Test Author");
      expect(content).toContain("### Removed");
      expect(content).toContain("- Revert change — Test Author");
      expect(content).toContain("### Fixed");
      expect(content).toContain("- Fix bug — Test Author");
    });

    test("should include today's date in version header", async () => {
      const today = new Date().toISOString().split("T")[0];
      const commits = [{ hash: "abc12345", type: "feat", scope: "cli", subject: "Add feature", author: "Test Author" }];

      // @ts-expect-error accessing private method for testing
      await command.updateChangelog(testDir, "1.1.0", "v1.1.0", commits);

      const content = await Bun.file(join(testDir, "CHANGELOG.md")).text();
      expect(content).toContain(`## [1.1.0] - ${today}`);
    });

    test("should map commit types to correct categories", async () => {
      const commits = [
        { hash: "a0000000", type: "feat", scope: "cli", subject: "feat commit", author: "Test Author" },
        { hash: "b0000000", type: "fix", scope: "cli", subject: "fix commit", author: "Test Author" },
        { hash: "c0000000", type: "perf", scope: "cli", subject: "perf commit", author: "Test Author" },
        { hash: "d0000000", type: "docs", scope: "cli", subject: "docs commit", author: "Test Author" },
        { hash: "e0000000", type: "style", scope: "cli", subject: "style commit", author: "Test Author" },
        { hash: "f0000000", type: "build", scope: "cli", subject: "build commit", author: "Test Author" },
        { hash: "g0000000", type: "ci", scope: "cli", subject: "ci commit", author: "Test Author" },
        { hash: "h0000000", type: "chore", scope: "cli", subject: "chore commit", author: "Test Author" },
        { hash: "i0000000", type: "revert", scope: "cli", subject: "revert commit", author: "Test Author" },
      ];

      // @ts-expect-error accessing private method for testing
      await command.updateChangelog(testDir, "1.1.0", "v1.1.0", commits);

      const content = await Bun.file(join(testDir, "CHANGELOG.md")).text();

      // feat -> Added
      expect(content).toContain("### Added");
      expect(content).toContain("- feat commit — Test Author");

      // fix -> Fixed
      expect(content).toContain("### Fixed");
      expect(content).toContain("- fix commit — Test Author");

      // perf, docs, style, build, ci, chore -> Changed
      expect(content).toContain("### Changed");
      expect(content).toContain("- perf commit — Test Author");
      expect(content).toContain("- docs commit — Test Author");
      expect(content).toContain("- style commit — Test Author");
      expect(content).toContain("- build commit — Test Author");
      expect(content).toContain("- ci commit — Test Author");
      expect(content).toContain("- chore commit — Test Author");

      // revert -> Removed
      expect(content).toContain("### Removed");
      expect(content).toContain("- revert commit — Test Author");
    });

    test("should only include categories with commits", async () => {
      const commits = [{ hash: "abc12345", type: "feat", scope: "cli", subject: "Add feature", author: "Test Author" }];

      // @ts-expect-error accessing private method for testing
      await command.updateChangelog(testDir, "1.1.0", "v1.1.0", commits);

      const content = await Bun.file(join(testDir, "CHANGELOG.md")).text();
      expect(content).toContain("### Added");
      expect(content).not.toContain("### Changed");
      expect(content).not.toContain("### Fixed");
      expect(content).not.toContain("### Deprecated");
      expect(content).not.toContain("### Removed");
      expect(content).not.toContain("### Security");
    });

    test("should append to existing changelog without Unreleased section", async () => {
      const existingChangelog = `# Changelog

## [1.0.0] - 2025-01-01

### Added

- Initial release
`;
      await Bun.write(join(testDir, "CHANGELOG.md"), existingChangelog);

      const commits = [{ hash: "abc12345", type: "feat", scope: "cli", subject: "New feature", author: "Test Author" }];

      // @ts-expect-error accessing private method for testing
      await command.updateChangelog(testDir, "1.1.0", "v1.1.0", commits);

      const content = await Bun.file(join(testDir, "CHANGELOG.md")).text();
      const newVersionIndex = content.indexOf("## [1.1.0]");
      const oldVersionIndex = content.indexOf("## [1.0.0]");
      expect(newVersionIndex).toBeLessThan(oldVersionIndex);
    });

    test("should include commit links when repo URL is available", async () => {
      // @ts-expect-error accessing private method for testing
      command.getRepoUrl = mock(() => Promise.resolve("https://github.com/test/repo"));

      const commits = [{ hash: "abc12345", type: "feat", scope: "cli", subject: "Add feature", author: "Test Author" }];

      // @ts-expect-error accessing private method for testing
      await command.updateChangelog(testDir, "1.1.0", "v1.1.0", commits);

      const content = await Bun.file(join(testDir, "CHANGELOG.md")).text();
      expect(content).toContain(
        "- Add feature — Test Author ([abc12345](https://github.com/test/repo/commit/abc12345))",
      );
    });
  });

  describe("run()", () => {
    test("should stop without releasing when the working tree has pending changes", async () => {
      const tagged: string[] = [];

      // @ts-expect-error accessing private method for testing
      command.hasPendingChanges = mock(() => Promise.resolve(true));
      // @ts-expect-error accessing private method for testing
      command.getLastTag = mock(() => Promise.resolve(null));
      // @ts-expect-error accessing private method for testing
      command.getCommitsSinceTag = mock(() =>
        Promise.resolve([{ hash: "abc12345", type: "feat", scope: "test", subject: "Add feature", author: "Test" }]),
      );
      // @ts-expect-error accessing private method for testing
      command.gitTag = mock((tag: string) => {
        tagged.push(tag);
        return Promise.resolve();
      });

      await Bun.write(
        join(testDir, "packages", "alpha", "package.json"),
        JSON.stringify({ name: "@talosjs/alpha", version: "1.0.0" }),
      );

      process.chdir(testDir);
      await command.run();

      expect(tagged).toEqual([]);
      expect(process.exitCode).toBe(1);
      process.exitCode = 0;
    });

    test("should not fail when no packages or modules directories exist", async () => {
      await Bun.write(join(testDir, ".gitkeep"), "");
      process.chdir(testDir);

      await command.run();
    });

    test("should skip packages without package.json", async () => {
      await Bun.write(join(testDir, "packages", "empty-pkg", ".gitkeep"), "");
      process.chdir(testDir);

      await command.run();
    });

    test("should commit bun.lock before pushing", async () => {
      const calls: string[] = [];

      // Mock confirm to accept push
      mockPrompt.mockImplementationOnce(() => Promise.resolve({ confirm: true }));

      // Mock git methods to track calls and simulate a releasable package
      // @ts-expect-error accessing private method for testing
      command.getLastTag = mock(() => Promise.resolve(null));
      // @ts-expect-error accessing private method for testing
      command.getCommitsSinceTag = mock(() =>
        Promise.resolve([{ hash: "abc12345", type: "feat", scope: "test", subject: "Add feature", author: "Test" }]),
      );
      // @ts-expect-error accessing private method for testing
      command.gitAdd = mock((...files: string[]) => {
        calls.push(`gitAdd:${files.join(",")}`);
        return Promise.resolve();
      });
      // @ts-expect-error accessing private method for testing
      command.gitCommit = mock((message: string) => {
        calls.push(`gitCommit:${message}`);
        return Promise.resolve();
      });
      // @ts-expect-error accessing private method for testing
      command.gitTag = mock(() => Promise.resolve());
      // @ts-expect-error accessing private method for testing
      command.bunInstall = mock(() => Promise.resolve());
      // @ts-expect-error accessing private method for testing
      command.gitPush = mock(() => Promise.resolve());

      // Create test package directory with package.json
      const pkgDir = join(testDir, "packages", "test-pkg");
      await Bun.write(join(pkgDir, "package.json"), JSON.stringify({ name: "@talosjs/test-pkg", version: "1.0.0" }));

      process.chdir(testDir);
      await command.run();

      // Verify bun.lock was staged and committed before push
      const releaseCommitIndex = calls.findIndex((c) => c.startsWith("gitCommit:chore(release):"));
      const bunLockAddIndex = calls.indexOf("gitAdd:bun.lock");
      const bunLockCommitIndex = calls.indexOf("gitCommit:chore(common): Update bun.lock");

      expect(releaseCommitIndex).toBeGreaterThan(-1);
      expect(bunLockAddIndex).toBeGreaterThan(-1);
      expect(bunLockCommitIndex).toBeGreaterThan(-1);
      // bun.lock commit must come after the release commit
      expect(bunLockAddIndex).toBeGreaterThan(releaseCommitIndex);
      expect(bunLockCommitIndex).toBeGreaterThan(bunLockAddIndex);
    });

    test("should release only the package matching the package option", async () => {
      const tagged: string[] = [];

      // @ts-expect-error accessing private method for testing
      command.getLastTag = mock(() => Promise.resolve(null));
      // @ts-expect-error accessing private method for testing
      command.getCommitsSinceTag = mock(() =>
        Promise.resolve([{ hash: "abc12345", type: "feat", scope: "test", subject: "Add feature", author: "Test" }]),
      );
      // @ts-expect-error accessing private method for testing
      command.gitAdd = mock(() => Promise.resolve());
      // @ts-expect-error accessing private method for testing
      command.gitCommit = mock(() => Promise.resolve());
      // @ts-expect-error accessing private method for testing
      command.gitTag = mock((tag: string) => {
        tagged.push(tag);
        return Promise.resolve();
      });

      await Bun.write(
        join(testDir, "packages", "alpha", "package.json"),
        JSON.stringify({ name: "@talosjs/alpha", version: "1.0.0" }),
      );
      await Bun.write(
        join(testDir, "packages", "beta", "package.json"),
        JSON.stringify({ name: "@talosjs/beta", version: "1.0.0" }),
      );

      process.chdir(testDir);
      await command.run({ packages: "alpha" });

      expect(tagged).toEqual(["@talosjs/alpha@1.1.0"]);
    });

    test("should release every package in a comma-separated packages list", async () => {
      const tagged: string[] = [];

      // @ts-expect-error accessing private method for testing
      command.getLastTag = mock(() => Promise.resolve(null));
      // @ts-expect-error accessing private method for testing
      command.getCommitsSinceTag = mock(() =>
        Promise.resolve([{ hash: "abc12345", type: "feat", scope: "test", subject: "Add feature", author: "Test" }]),
      );
      // @ts-expect-error accessing private method for testing
      command.gitAdd = mock(() => Promise.resolve());
      // @ts-expect-error accessing private method for testing
      command.gitCommit = mock(() => Promise.resolve());
      // @ts-expect-error accessing private method for testing
      command.gitTag = mock((tag: string) => {
        tagged.push(tag);
        return Promise.resolve();
      });

      await Bun.write(
        join(testDir, "packages", "alpha", "package.json"),
        JSON.stringify({ name: "@talosjs/alpha", version: "1.0.0" }),
      );
      await Bun.write(
        join(testDir, "packages", "beta", "package.json"),
        JSON.stringify({ name: "@talosjs/beta", version: "1.0.0" }),
      );
      await Bun.write(
        join(testDir, "packages", "gamma", "package.json"),
        JSON.stringify({ name: "@talosjs/gamma", version: "1.0.0" }),
      );

      process.chdir(testDir);
      await command.run({ packages: "alpha,beta" });

      expect(tagged.sort()).toEqual(["@talosjs/alpha@1.1.0", "@talosjs/beta@1.1.0"]);
    });

    test("should release both packages and modules from comma-separated lists", async () => {
      const tagged: string[] = [];

      // @ts-expect-error accessing private method for testing
      command.getLastTag = mock(() => Promise.resolve(null));
      // @ts-expect-error accessing private method for testing
      command.getCommitsSinceTag = mock(() =>
        Promise.resolve([{ hash: "abc12345", type: "feat", scope: "test", subject: "Add feature", author: "Test" }]),
      );
      // @ts-expect-error accessing private method for testing
      command.gitAdd = mock(() => Promise.resolve());
      // @ts-expect-error accessing private method for testing
      command.gitCommit = mock(() => Promise.resolve());
      // @ts-expect-error accessing private method for testing
      command.gitTag = mock((tag: string) => {
        tagged.push(tag);
        return Promise.resolve();
      });

      await Bun.write(
        join(testDir, "packages", "alpha", "package.json"),
        JSON.stringify({ name: "@talosjs/alpha", version: "1.0.0" }),
      );
      await Bun.write(
        join(testDir, "packages", "beta", "package.json"),
        JSON.stringify({ name: "@talosjs/beta", version: "1.0.0" }),
      );
      await Bun.write(
        join(testDir, "modules", "billing", "package.json"),
        JSON.stringify({ name: "@app/billing", version: "1.0.0" }),
      );

      process.chdir(testDir);
      await command.run({ packages: "alpha", modules: "billing" });

      expect(tagged.sort()).toEqual(["@app/billing@1.1.0", "@talosjs/alpha@1.1.0"]);
    });

    test("should release only the module matching the module option", async () => {
      const tagged: string[] = [];

      // @ts-expect-error accessing private method for testing
      command.getLastTag = mock(() => Promise.resolve(null));
      // @ts-expect-error accessing private method for testing
      command.getCommitsSinceTag = mock(() =>
        Promise.resolve([{ hash: "abc12345", type: "feat", scope: "test", subject: "Add feature", author: "Test" }]),
      );
      // @ts-expect-error accessing private method for testing
      command.gitAdd = mock(() => Promise.resolve());
      // @ts-expect-error accessing private method for testing
      command.gitCommit = mock(() => Promise.resolve());
      // @ts-expect-error accessing private method for testing
      command.gitTag = mock((tag: string) => {
        tagged.push(tag);
        return Promise.resolve();
      });

      await Bun.write(
        join(testDir, "modules", "billing", "package.json"),
        JSON.stringify({ name: "@app/billing", version: "1.0.0" }),
      );
      await Bun.write(
        join(testDir, "packages", "alpha", "package.json"),
        JSON.stringify({ name: "@talosjs/alpha", version: "1.0.0" }),
      );

      process.chdir(testDir);
      await command.run({ modules: "billing" });

      expect(tagged).toEqual(["@app/billing@1.1.0"]);
    });

    test("should not release a package when only the module option matches its name", async () => {
      const tagged: string[] = [];

      // @ts-expect-error accessing private method for testing
      command.getLastTag = mock(() => Promise.resolve(null));
      // @ts-expect-error accessing private method for testing
      command.getCommitsSinceTag = mock(() =>
        Promise.resolve([{ hash: "abc12345", type: "feat", scope: "test", subject: "Add feature", author: "Test" }]),
      );
      // @ts-expect-error accessing private method for testing
      command.gitTag = mock((tag: string) => {
        tagged.push(tag);
        return Promise.resolve();
      });

      await Bun.write(
        join(testDir, "packages", "alpha", "package.json"),
        JSON.stringify({ name: "@talosjs/alpha", version: "1.0.0" }),
      );

      process.chdir(testDir);
      await command.run({ modules: "alpha" });

      expect(tagged).toEqual([]);
    });

    test("should not fail when the package option matches nothing", async () => {
      await Bun.write(
        join(testDir, "packages", "alpha", "package.json"),
        JSON.stringify({ name: "@talosjs/alpha", version: "1.0.0" }),
      );

      process.chdir(testDir);
      await command.run({ packages: "missing" });
    });
  });
});
