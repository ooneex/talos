import { homedir } from "node:os";
import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import ooTemplate from "../templates/completions/_oo.txt";
import talosTemplate from "../templates/completions/_talos.txt";
import { LOG_OPTIONS } from "../utils";

@decorator.command()
export class CompletionZshCommand implements ICommand {
  public getName(): string {
    return "completion:zsh";
  }

  public getDescription(): string {
    return "Install Zsh completion for oo command";
  }

  public async run(): Promise<void> {
    const completionDir = join(homedir(), ".zsh");

    const ooFilePath = join(completionDir, "_oo");
    await Bun.write(ooFilePath, ooTemplate);

    const talosFilePath = join(completionDir, "_talos");
    await Bun.write(talosFilePath, talosTemplate);

    const logger = new TerminalLogger();

    logger.success(`${ooFilePath} created successfully`, undefined, LOG_OPTIONS);

    logger.success(`${talosFilePath} created successfully`, undefined, LOG_OPTIONS);

    logger.info(
      "Add the following to your .zshrc if not already present:\n  fpath=(~/.zsh $fpath)\n  autoload -Uz compinit && compinit",
      undefined,
      LOG_OPTIONS,
    );
  }
}
