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

const GITLAB_TOKEN_URL = "https://gitlab.com/-/user_settings/personal_access_tokens";

@decorator.command()
export class GitlabCredentialsCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "gitlab:credentials:create";
  }

  public getDescription(): string {
    return "Save a GitLab Personal Access Token under the user config";
  }

  public async run(options: T): Promise<void> {
    let { token } = options;
    const { silent } = options;

    if (!silent) {
      const logger = new TerminalLogger();
      logger.info(`Create a Personal Access Token at ${GITLAB_TOKEN_URL}`, undefined, LOG_OPTIONS);
    }

    if (!token) {
      token = await askPassword({ message: "Enter GitLab Personal Access Token" });
    }

    await saveCredentials("gitlab.yml", "GitLab", { token }, silent);
  }
}
