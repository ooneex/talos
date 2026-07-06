import { basename } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { CLI_PACKAGE_NAME, createSpinner, getCliVersion, LOG_OPTIONS, spawnStep } from "../utils";
import { CompletionBashCommand } from "./CompletionBashCommand";
import { CompletionFishCommand } from "./CompletionFishCommand";
import { CompletionZshCommand } from "./CompletionZshCommand";

@decorator.command()
export class UpgradeCommand implements ICommand {
  public getName(): string {
    return "upgrade";
  }

  public getDescription(): string {
    return "Upgrade the CLI to its latest version";
  }

  public async run(): Promise<void> {
    const logger = new TerminalLogger();

    const currentVersion = await getCliVersion();
    const latestVersion = await this.fetchLatestVersion();

    if (!latestVersion) {
      logger.error(
        "Unable to determine the latest version",
        { message: `Could not reach the npm registry for ${CLI_PACKAGE_NAME}` },
        LOG_OPTIONS,
      );
      process.exitCode = 1;
      return;
    }

    if (currentVersion === latestVersion) {
      logger.success(`Already on the latest version (v${currentVersion})`, undefined, LOG_OPTIONS);
      return;
    }

    logger.info(`Upgrading from v${currentVersion} to v${latestVersion}...`, undefined, LOG_OPTIONS);

    const succeeded = await spawnStep(logger, ["bun", "add", "-g", `${CLI_PACKAGE_NAME}@latest`], process.cwd(), {
      start: `Installing ${CLI_PACKAGE_NAME}@${latestVersion}...`,
      success: `Upgraded to v${latestVersion}`,
      failure: (exitCode) => `Upgrade failed (exit code: ${exitCode})`,
    });

    if (!succeeded) {
      logger.info(`You can upgrade manually with: bun add -g ${CLI_PACKAGE_NAME}@latest`, undefined, LOG_OPTIONS);
      return;
    }

    await this.refreshCompletions(logger);
  }

  /**
   * Reinstall the shell completion scripts after a successful upgrade so newly
   * added commands are completable without the user re-running the relevant
   * `completion:*` command. The shell is inferred from `$SHELL`; unknown shells
   * are skipped silently since there is no completion to regenerate.
   */
  private async refreshCompletions(logger: TerminalLogger): Promise<void> {
    const shell = basename(process.env.SHELL ?? "");

    if (shell === "zsh") {
      await new CompletionZshCommand().run();
    } else if (shell === "bash") {
      await new CompletionBashCommand().run();
    } else if (shell === "fish") {
      await new CompletionFishCommand().run();
    } else {
      logger.info(
        "Could not detect your shell; run `oo completion:zsh`, `oo completion:bash`, or `oo completion:fish` to refresh completions.",
        undefined,
        LOG_OPTIONS,
      );
    }
  }

  /**
   * Query the npm registry for the version published under the `latest` tag,
   * returning null when the request fails so the caller can surface a clear
   * error instead of attempting a blind reinstall.
   */
  private async fetchLatestVersion(): Promise<string | null> {
    const spinner = createSpinner("Checking for updates...");

    try {
      const response = await fetch(`https://registry.npmjs.org/${CLI_PACKAGE_NAME}/latest`, {
        headers: { accept: "application/json" },
      });

      if (!response.ok) return null;

      const data = (await response.json()) as { version?: string };
      return typeof data.version === "string" ? data.version : null;
    } catch {
      return null;
    } finally {
      spinner.stop();
    }
  }
}
