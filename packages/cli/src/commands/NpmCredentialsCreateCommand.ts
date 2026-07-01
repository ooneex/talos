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

const NPM_TOKEN_URL = "https://www.npmjs.com/settings/<username>/tokens/granular-access-tokens/new";

@decorator.command()
export class NpmCredentialsCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "npm:credentials:create";
  }

  public getDescription(): string {
    return "Save an npm Granular Access Token under the user config";
  }

  public async run(options: T): Promise<void> {
    let { token } = options;
    const { silent } = options;

    if (!silent) {
      const logger = new TerminalLogger();
      logger.info(`Create a Granular Access Token at ${NPM_TOKEN_URL}`, undefined, LOG_OPTIONS);
    }

    if (!token) {
      token = await askPassword({ message: "Enter npm Granular Access Token" });
    }

    await saveCredentials("npm.yml", "npm", { token }, silent);
  }
}
