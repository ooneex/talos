import { homedir } from "node:os";
import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import bashTemplate from "../templates/completions/talos.bash.txt";
import { LOG_OPTIONS } from "../utils";

@decorator.command()
export class CompletionBashCommand implements ICommand {
  public getName(): string {
    return "completion:bash";
  }

  public getDescription(): string {
    return "Install Bash completion for oo command";
  }

  public async run(): Promise<void> {
    const completionDir = join(homedir(), ".local", "share", "bash-completion", "completions");

    const ooFilePath = join(completionDir, "oo");
    await Bun.write(ooFilePath, bashTemplate);

    const talosFilePath = join(completionDir, "talos");
    await Bun.write(talosFilePath, bashTemplate);

    const logger = new TerminalLogger();

    logger.success(`${ooFilePath} created successfully`, undefined, LOG_OPTIONS);

    logger.success(`${talosFilePath} created successfully`, undefined, LOG_OPTIONS);

    logger.info(
      "Requires the bash-completion package, which loads this directory automatically.\n  Otherwise add the following to your .bashrc:\n  source ~/.local/share/bash-completion/completions/talos",
      undefined,
      LOG_OPTIONS,
    );
  }
}
