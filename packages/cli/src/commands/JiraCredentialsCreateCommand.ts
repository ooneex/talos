import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { saveCredentials } from "../credentials";
import { askInput } from "../prompts/askInput";
import { askPassword } from "../prompts/askPassword";
import { LOG_OPTIONS } from "../utils";

type CommandOptionsType = {
  baseUrl?: string;
  email?: string;
  token?: string;
  silent?: boolean;
};

const JIRA_TOKEN_URL = "https://id.atlassian.com/manage-profile/security/api-tokens";

@decorator.command()
export class JiraCredentialsCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "jira:credentials:create";
  }

  public getDescription(): string {
    return "Save a Jira API token under the user config";
  }

  public async run(options: T): Promise<void> {
    let { baseUrl, email, token } = options;
    const { silent } = options;

    if (!silent) {
      const logger = new TerminalLogger();
      logger.info(`Create an API token at ${JIRA_TOKEN_URL}`, undefined, LOG_OPTIONS);
    }

    if (!baseUrl) {
      baseUrl = await askInput({ message: "Enter Jira base URL", initial: "https://your-domain.atlassian.net" });
    }

    if (!email) {
      email = await askInput({ message: "Enter Jira account email" });
    }

    if (!token) {
      token = await askPassword({ message: "Enter Jira API token" });
    }

    await saveCredentials("jira.yml", "Jira", { baseUrl, email, token }, silent);
  }
}
