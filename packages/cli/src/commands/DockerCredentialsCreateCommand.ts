import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { saveCredentials } from "../credentials";
import { askInput } from "../prompts/askInput";
import { askPassword } from "../prompts/askPassword";
import { LOG_OPTIONS } from "../utils";

type CommandOptionsType = {
  registry?: string;
  username?: string;
  token?: string;
  silent?: boolean;
};

const DOCKER_TOKEN_URL = "https://app.docker.com/settings/personal-access-tokens/create";

@decorator.command()
export class DockerCredentialsCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "docker:credentials:create";
  }

  public getDescription(): string {
    return "Save a Docker registry access token under the user config";
  }

  public async run(options: T): Promise<void> {
    let { registry, username, token } = options;
    const { silent } = options;

    if (!silent) {
      const logger = new TerminalLogger();
      logger.info(`Create a Docker access token at ${DOCKER_TOKEN_URL}`, undefined, LOG_OPTIONS);
    }

    if (!registry) {
      registry = await askInput({ message: "Enter Docker registry", initial: "docker.io" });
    }

    if (!username) {
      username = await askInput({ message: "Enter Docker username" });
    }

    if (!token) {
      token = await askPassword({ message: "Enter Docker access token" });
    }

    await saveCredentials("docker.yml", "Docker", { registry, username, token }, silent);
  }
}
