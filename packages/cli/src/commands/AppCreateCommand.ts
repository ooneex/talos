import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { rolesConfig } from "@talosjs/role";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import { toSnakeCase } from "@talosjs/utils/toSnakeCase";
import { copySkeletonPath, getSkeletonDir } from "../agentConfig";
import { askCiProvider } from "../prompts/askCiProvider";
import { askConfirm } from "../prompts/askConfirm";
import { askDestination } from "../prompts/askDestination";
import { askName } from "../prompts/askName";
import packageTemplate from "../templates/app/package.json.txt";
import { templates as bitbucketTemplates } from "../templates/bitbucket/index";
import { templates as githubTemplates } from "../templates/github/index";
import { templates as gitlabTemplates } from "../templates/gitlab/index";
import renovateTemplate from "../templates/renovate.json.txt";
import { LOG_OPTIONS, LOG_OPTIONS_PLAIN, spawnStep, toYaml } from "../utils";
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

    const skeletonDir = await getSkeletonDir(logger);
    if (!skeletonDir) return;

    await Promise.all([
      copySkeletonPath(skeletonDir, "modules/app", join(destination, "modules", "app")),
      copySkeletonPath(skeletonDir, "modules/shared", join(destination, "modules", "shared")),
      copySkeletonPath(skeletonDir, ".dockerignore", join(destination, ".dockerignore")),
      Bun.write(join(destination, "var", ".gitkeep"), ""),
    ]);

    await Bun.write(join(destination, "modules", "shared", "src", "roles.yml"), `${toYaml(rolesConfig)}\n`);

    const snakeName = toSnakeCase(name);
    const dockerfilePath = join(destination, "modules", "app", "Dockerfile");
    const dockerComposePath = join(destination, "modules", "app", "docker-compose.yml");

    await Promise.all([
      Bun.write(dockerfilePath, (await Bun.file(dockerfilePath).text()).replace(/skeleton/g, snakeName)),
      Bun.write(dockerComposePath, (await Bun.file(dockerComposePath).text()).replace(/skeleton/g, snakeName)),
      rm(join(destination, "bun.lock"), { force: true }),
    ]);

    const appInitCommand = new AppInitCommand();
    await appInitCommand.run({ name, destination, silent: true, appType: "api" });

    const depsInstalled = await spawnStep(
      logger,
      [
        "bun",
        "add",
        "@talosjs/app",
        "@talosjs/app-env",
        "@talosjs/auth",
        "@talosjs/cache",
        "@talosjs/container",
        "@talosjs/repository",
        "@talosjs/database",
        "@talosjs/logger",
        "@talosjs/mailer",
        "@talosjs/middleware",
        "@talosjs/module",
        "@talosjs/rate-limit",
        "@talosjs/role",
        "@talosjs/routing",
        "@talosjs/storage",
        "@talosjs/translation",
        "@talosjs/types",
        "@talosjs/user",
        "@talosjs/utils",
        "@talosjs/validation",
        "@talosjs/controller",
        "pg",
        "react",
        "react-dom",
        "apache-arrow",
        "reflect-metadata",
        "typeorm@^1.0.0",
      ],
      destination,
      {
        start: "Installing dependencies...",
        failure: (exitCode) => `Failed to install dependencies (exit code: ${exitCode})`,
      },
    );
    if (!depsInstalled) return;

    const devDepsInstalled = await spawnStep(
      logger,
      ["bun", "add", "-D", "@talosjs/command", "@talosjs/migrations", "@talosjs/seeds"],
      destination,
      {
        start: "Installing dev dependencies...",
        failure: (exitCode) => `Failed to install dev dependencies (exit code: ${exitCode})`,
      },
    );
    if (!devDepsInstalled) return;

    const rootPackagePath = join(destination, "package.json");
    const rootPackage = await Bun.file(rootPackagePath).json();
    const templatePackage = JSON.parse(packageTemplate.replace(/{{NAME}}/g, kebabName));
    rootPackage.scripts ??= templatePackage.scripts;
    rootPackage.workspaces ??= templatePackage.workspaces;
    await Bun.write(rootPackagePath, `${JSON.stringify(rootPackage, null, 2)}\n`);

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
