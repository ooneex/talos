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

const GITHUB_TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";

@decorator.command()
export class GithubCredentialsCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "github:credentials:create";
  }

  public getDescription(): string {
    return "Save a GitHub Personal Access Token under the user config";
  }

  public async run(options: T): Promise<void> {
    let { token } = options;
    const { silent } = options;

    if (!silent) {
      const logger = new TerminalLogger();
      logger.info(`Create a Personal Access Token at ${GITHUB_TOKEN_URL}`, undefined, LOG_OPTIONS);
    }

    if (!token) {
      token = await askPassword({ message: "Enter GitHub Personal Access Token" });
    }

    await saveCredentials("github.yml", "GitHub", { token }, silent);
  }
}
