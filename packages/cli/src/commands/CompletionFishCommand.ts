import { homedir } from "node:os";
import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import fishTemplate from "../templates/completions/talos.fish.txt";
import { LOG_OPTIONS } from "../utils";

@decorator.command()
export class CompletionFishCommand implements ICommand {
  public getName(): string {
    return "completion:fish";
  }

  public getDescription(): string {
    return "Install Fish completion for oo command";
  }

  public async run(): Promise<void> {
    const completionDir = join(homedir(), ".config", "fish", "completions");

    const ooFilePath = join(completionDir, "oo.fish");
    await Bun.write(ooFilePath, fishTemplate);

    const talosFilePath = join(completionDir, "talos.fish");
    await Bun.write(talosFilePath, fishTemplate);

    const logger = new TerminalLogger();

    logger.success(`${ooFilePath} created successfully`, undefined, LOG_OPTIONS);

    logger.success(`${talosFilePath} created successfully`, undefined, LOG_OPTIONS);

    logger.info(
      "Fish loads completions from this directory automatically.\n  Start a new shell or run `exec fish` to pick them up.",
      undefined,
      LOG_OPTIONS,
    );
  }
}
