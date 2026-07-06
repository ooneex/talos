import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { CommitlintInitCommand } = await import("@/commands/CommitlintInitCommand");

const git = async (cwd: string, args: string[]): Promise<void> => {
  await Bun.spawn(["git", ...args], { cwd, stdout: "ignore", stderr: "ignore" }).exited;
};

describe("CommitlintInitCommand", () => {
  let repo: string;

  beforeEach(async () => {
    // Use an isolated repo outside the workspace so installing the hook never
    // touches the real .git of this monorepo.
    repo = mkdtempSync(join(tmpdir(), "commitlint-init-"));
    await git(repo, ["init"]);
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  test("should expose the expected name and description", () => {
    const command = new CommitlintInitCommand();
    expect(command.getName()).toBe("commitlint:init");
    expect(command.getDescription().length).toBeGreaterThan(0);
  });

  test("should install an executable commit-msg hook that calls commitlint:check", async () => {
    await new CommitlintInitCommand().run({ cwd: repo });

    const hookPath = join(repo, ".git", "hooks", "commit-msg");
    expect(existsSync(hookPath)).toBe(true);

    const content = await Bun.file(hookPath).text();
    // The hook shells out to the `talos` CLI resolved from PATH — no baked-in path.
    expect(content).toContain(`exec talos commitlint:check --file "$1"`);

    // The hook must be executable for git to run it.
    expect(statSync(hookPath).mode & 0o111).toBeGreaterThan(0);
  });

  test("should fail without installing the hook when git is not installed", async () => {
    const originalWhich = Bun.which;
    Bun.which = (() => null) as typeof Bun.which;

    try {
      await new CommitlintInitCommand().run({ cwd: repo });

      expect(existsSync(join(repo, ".git", "hooks", "commit-msg"))).toBe(false);
      expect(process.exitCode).toBe(1);
      process.exitCode = 0;
    } finally {
      Bun.which = originalWhich;
    }
  });

  test("should clear a husky-style core.hooksPath and use the standard hooks dir", async () => {
    // Simulate husky having redirected hooks elsewhere.
    mkdirSync(join(repo, ".husky", "_"), { recursive: true });
    await git(repo, ["config", "core.hooksPath", ".husky/_"]);

    await new CommitlintInitCommand().run({ cwd: repo });

    const hooksPath = Bun.spawn(["git", "config", "core.hooksPath"], { cwd: repo, stdout: "pipe", stderr: "ignore" });
    const value = (await new Response(hooksPath.stdout).text()).trim();
    expect(value).toBe("");
    expect(existsSync(join(repo, ".git", "hooks", "commit-msg"))).toBe(true);
  });
});
