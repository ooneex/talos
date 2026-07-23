import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import { toSnakeCase } from "@talosjs/utils/toSnakeCase";
import { askCiProvider } from "../prompts/askCiProvider";
import { askConfirm } from "../prompts/askConfirm";
import { askDestination } from "../prompts/askDestination";
import { askName } from "../prompts/askName";
import { templates as bitbucketTemplates } from "../templates/bitbucket/index";
import { templates as githubTemplates } from "../templates/github/index";
import { templates as gitlabTemplates } from "../templates/gitlab/index";
import renovateTemplate from "../templates/renovate.json.txt";
import { LOG_OPTIONS, LOG_OPTIONS_PLAIN } from "../utils";
import { AppInitCommand } from "./AppInitCommand";

type CommandOptionsType = {
  name?: string;
  destination?: string;
};

@decorator.command()
export class AppCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "app:create";
  }

  public getDescription(): string {
    return "Create a new application";
  }

  public async run(options: T): Promise<void> {
    let { name, destination } = options;
    const logger = new TerminalLogger();

    if (!name) {
      name = await askName({ message: "Enter application name" });
    }

    const kebabName = toKebabCase(name);

    if (!destination) {
      destination = await askDestination({ message: "Enter destination path", initial: kebabName });
    }

    const appInitCommand = new AppInitCommand();
    await appInitCommand.run({ name, destination, silent: true, appType: "api" });
    const snakeName = toSnakeCase(name);

    logger.success(`${kebabName} created successfully at ${destination}`, undefined, LOG_OPTIONS);

    logger.info(`\nGet started:\n  cd ${destination}`, undefined, LOG_OPTIONS_PLAIN);
    logger.info("\nStart the app:\n  talos app:start", undefined, LOG_OPTIONS_PLAIN);
    logger.info("Stop the app:\n  talos app:stop", undefined, LOG_OPTIONS_PLAIN);

    const createCiCd = await askConfirm({ message: "Create CI/CD files?", initial: true });

    if (createCiCd) {
      const provider = await askCiProvider({ message: "Choose CI/CD provider" });

      if (provider === "github") {
        await Bun.write(
          join(destination, ".github", "workflows", "ci.yml"),
          githubTemplates.ci.replace(/{{NAME}}/g, snakeName),
        );
        await Bun.write(
          join(destination, ".github", "workflows", "production.yml"),
          githubTemplates.production.replace(/{{NAME}}/g, snakeName),
        );
      } else if (provider === "gitlab") {
        await Bun.write(
          join(destination, ".gitlab", "ci", "ci.yml"),
          gitlabTemplates.ci.replace(/{{NAME}}/g, snakeName),
        );
        await Bun.write(
          join(destination, ".gitlab", "ci", "production.yml"),
          gitlabTemplates.production.replace(/{{NAME}}/g, snakeName),
        );
        await Bun.write(
          join(destination, ".gitlab-ci.yml"),
          "include:\n  - local: .gitlab/ci/ci.yml\n  - local: .gitlab/ci/production.yml\n",
        );
      } else {
        await Bun.write(
          join(destination, "bitbucket-pipelines.yml"),
          bitbucketTemplates.pipelines.replace(/{{NAME}}/g, snakeName),
        );
      }

      await Bun.write(join(destination, "renovate.json"), renovateTemplate);

      logger.success(`${provider} CI/CD files created`, undefined, LOG_OPTIONS);
    }
  }
}
