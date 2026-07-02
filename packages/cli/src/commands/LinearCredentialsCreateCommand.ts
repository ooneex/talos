import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { saveCredentials } from "../credentials";
import { askPassword } from "../prompts/askPassword";
import { LOG_OPTIONS } from "../utils";

type CommandOptionsType = {
  token?: string;
  silent?: boolean;
};

const LINEAR_TOKEN_URL = "https://linear.app/settings/api";

@decorator.command()
export class LinearCredentialsCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "linear:credentials:create";
  }

  public getDescription(): string {
    return "Save a Linear Personal API key under the user config";
  }

  public async run(options: T): Promise<void> {
    let { token } = options;
    const { silent } = options;

    if (!silent) {
      const logger = new TerminalLogger();
      logger.info(`Create a Personal API key at ${LINEAR_TOKEN_URL}`, undefined, LOG_OPTIONS);
    }

    if (!token) {
      token = await askPassword({ message: "Enter Linear Personal API key" });
    }

    await saveCredentials("linear.yml", "Linear", { token }, silent);
  }
}
