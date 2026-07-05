import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { checkCommitMessageFile } from "../commitlint";
import { LOG_OPTIONS } from "../utils";

type CommandOptionsType = {
  file?: string;
  cwd?: string;
};

// Resolve the repository root so scope discovery works no matter which directory
// git invokes the hook from. Falls back to null when git is unavailable.
const resolveGitRoot = async (cwd: string): Promise<string | null> => {
  try {
    const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], { cwd, stdout: "pipe", stderr: "ignore" });
    const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    return exitCode === 0 ? stdout.trim() : null;
  } catch {
    return null;
  }
};

/**
 * Runner behind the `commit-msg` git hook installed by `commitlint:init`. Reads
 * the commit message file passed as `--file` and validates it against the
 * conventional-commit rules, exiting non-zero (which aborts the commit) with the
 * list of violations when the message is invalid.
 */
@decorator.command()
export class CommitlintCheckCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "commitlint:check";
  }

  public getDescription(): string {
    return "Validate a commit message file against the conventional-commit rules";
  }

  public async run(options: T): Promise<void> {
    const logger = new TerminalLogger();
    const file = options?.file;

    if (!file) {
      logger.error("commitlint:check requires --file <commit-message-file>", undefined, LOG_OPTIONS);
      process.exitCode = 1;
      return;
    }

    const rootDir = options?.cwd ?? (await resolveGitRoot(process.cwd())) ?? process.cwd();
    const errors = await checkCommitMessageFile(file, rootDir);

    if (errors.length === 0) return;

    const details = errors.map((error) => `  • ${error}`).join("\n");
    logger.error(`Invalid commit message:\n${details}`, undefined, LOG_OPTIONS);
    process.exitCode = 1;
  }
}
