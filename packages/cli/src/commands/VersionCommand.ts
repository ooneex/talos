import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { getCliVersion, LOG_OPTIONS } from "../utils";

@decorator.command()
export class VersionCommand implements ICommand {
  public getName(): string {
    return "version";
  }

  public getDescription(): string {
    return "Print the installed CLI version";
  }

  public async run(): Promise<void> {
    const version = await getCliVersion();
    const logger = new TerminalLogger();

    logger.info(`v${version}`, undefined, LOG_OPTIONS);
  }
}
