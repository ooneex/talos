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

    const credentials = {
      profiles: {
        default: {
          token,
        },
      },
    };

    const credentialsPath = join(homedir(), ".talos", "credentials", "npm.yml");
    await Bun.write(credentialsPath, `${toYaml(credentials)}\n`);

    if (!silent) {
      const logger = new TerminalLogger();

      logger.success(`npm credentials saved to ${credentialsPath}`, undefined, LOG_OPTIONS);
    }
  }
}
