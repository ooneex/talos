import { homedir } from "node:os";
import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { askPassword } from "../prompts/askPassword";
import { LOG_OPTIONS, toYaml } from "../utils";

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

    const credentials = {
      profiles: {
        default: {
          token,
        },
      },
    };

    const credentialsPath = join(homedir(), ".talos", "credentials", "github.yml");
    await Bun.write(credentialsPath, `${toYaml(credentials)}\n`);

    if (!silent) {
      const logger = new TerminalLogger();

      logger.success(`GitHub credentials saved to ${credentialsPath}`, undefined, LOG_OPTIONS);
    }
  }
}
