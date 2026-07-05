import { chmod, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { LOG_OPTIONS } from "../utils";

type CommandOptionsType = {
  cwd?: string;
};

// Locate the repository's hooks directory. `--git-path hooks` respects worktrees
// and any custom git layout, returning a path relative to `cwd`.
const resolveHooksDir = async (cwd: string): Promise<string | null> => {
  try {
    const proc = Bun.spawn(["git", "rev-parse", "--git-path", "hooks"], { cwd, stdout: "pipe", stderr: "ignore" });
    const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    return exitCode === 0 ? resolve(cwd, stdout.trim()) : null;
  } catch {
    return null;
  }
};

// Best-effort git config change; a non-zero exit (e.g. the key was never set) is fine.
const runGit = async (cwd: string, args: string[]): Promise<void> => {
  try {
    await Bun.spawn(["git", ...args], { cwd, stdout: "ignore", stderr: "ignore" }).exited;
  } catch {
    // Ignore — the hook is installed regardless.
  }
};

// The hook shells out to the `talos` CLI to lint the message, so it stays in
// sync with the framework's rules and requires no path baked in at install time.
const buildHook = (): string =>
  `#!/usr/bin/env sh
# Talos commit-message linter — installed by \`oo commitlint:init\`.
exec talos commitlint:check --file "$1"
`;

/**
 * Install the git `commit-msg` hook that validates commit messages against the
 * project's conventional-commit rules, replacing husky + commitlint. Also clears
 * any `core.hooksPath` husky had set so git uses the standard hooks directory.
 */
@decorator.command()
export class CommitlintInitCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "commitlint:init";
  }

  public getDescription(): string {
    return "Install the git commit-msg hook that lints commit messages";
  }

  public async run(options?: T): Promise<void> {
    const logger = new TerminalLogger();
    const cwd = options?.cwd ?? process.cwd();

    // Undo husky's redirection first so the hook is installed into — and later
    // read from — the standard hooks directory rather than husky's.
    await runGit(cwd, ["config", "--unset", "core.hooksPath"]);

    const hooksDir = await resolveHooksDir(cwd);
    if (!hooksDir) {
      logger.error("commitlint:init must run inside a git repository", undefined, LOG_OPTIONS);
      process.exitCode = 1;
      return;
    }

    const hookPath = join(hooksDir, "commit-msg");
    await mkdir(hooksDir, { recursive: true });
    await Bun.write(hookPath, buildHook());
    await chmod(hookPath, 0o755);

    logger.success(`${hookPath} installed successfully`, undefined, LOG_OPTIONS);
  }
}
