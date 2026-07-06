import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { saveCredentials } from "../credentials";
import { askInput } from "../prompts/askInput";
import { askPassword } from "../prompts/askPassword";
import { LOG_OPTIONS } from "../utils";

type CommandOptionsType = {
  username?: string;
  token?: string;
  silent?: boolean;
};

const BITBUCKET_APP_PASSWORD_URL = "https://bitbucket.org/account/settings/app-passwords/";

@decorator.command()
export class BitbucketCredentialsCreateCommand<T extends CommandOptionsType = CommandOptionsType>
  implements ICommand<T>
{
  public getName(): string {
    return "bitbucket:credentials:create";
  }

  public getDescription(): string {
    return "Save a Bitbucket app password under the user config";
  }

  public async run(options: T): Promise<void> {
    let { username, token } = options;
    const { silent } = options;

    if (!silent) {
      const logger = new TerminalLogger();
      logger.info(`Create an app password at ${BITBUCKET_APP_PASSWORD_URL}`, undefined, LOG_OPTIONS);
    }

    if (!username) {
      username = await askInput({ message: "Enter Bitbucket username" });
    }

    if (!token) {
      token = await askPassword({ message: "Enter Bitbucket app password" });
    }

    await saveCredentials("bitbucket.yml", "Bitbucket", { username, token }, silent);
  }
}
