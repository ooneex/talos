import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { rolesConfig } from "@talosjs/role";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import { toSnakeCase } from "@talosjs/utils/toSnakeCase";
import { askCiProvider } from "../prompts/askCiProvider";
import { askConfirm } from "../prompts/askConfirm";
import { askDestination } from "../prompts/askDestination";
import { askName } from "../prompts/askName";
import dockerignoreTemplate from "../templates/app/.dockerignore.txt";
import databaseTemplate from "../templates/app/app-database.txt";
import dockerfileTemplate from "../templates/app/Dockerfile.txt";
import dockerComposeTemplate from "../templates/app/docker-compose.yml.txt";
import indexTemplate from "../templates/app/index.ts.txt";
import onAppStartTemplate from "../templates/app/OnAppStart.ts.txt";
import packageTemplate from "../templates/app/package.json.txt";
import { templates as bitbucketTemplates } from "../templates/bitbucket/index";
import { templates as githubTemplates } from "../templates/github/index";
import { templates as gitlabTemplates } from "../templates/gitlab/index";
import renovateTemplate from "../templates/renovate.json.txt";
import { createSpinner, LOG_OPTIONS, LOG_OPTIONS_PLAIN, toYaml } from "../utils";
import { AppInitCommand } from "./AppInitCommand";
import { ModuleCreateCommand } from "./ModuleCreateCommand";

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

    if (!name) {
      name = await askName({ message: "Enter application name" });
    }

    const kebabName = toKebabCase(name);

    if (!destination) {
      destination = await askDestination({ message: "Enter destination path", initial: kebabName });
    }

    // Create app module
    const makeModuleCommand = new ModuleCreateCommand();
    await makeModuleCommand.run({
      name: "app",
      cwd: destination,
      silent: true,
    });

    const appModulePackagePath = join(destination, "modules", "app", "package.json");
    const appModulePackageJson = await Bun.file(appModulePackagePath).json();
    await Bun.write(appModulePackagePath, JSON.stringify(appModulePackageJson, null, 2));

    // The app module is an API, not a generic module
    const appYmlPath = join(destination, "modules", "app", "app.yml");
    const appYmlContent = await Bun.file(appYmlPath).text();
    await Bun.write(appYmlPath, appYmlContent.replace('type: "module"', 'type: "api"'));

    await Bun.write(join(destination, "modules", "app", "src", "index.ts"), indexTemplate);
    await Bun.write(join(destination, "modules", "app", "src", "OnAppStart.ts"), onAppStartTemplate);

    // Create shared module
    await makeModuleCommand.run({
      name: "shared",
      cwd: destination,
      silent: true,
    });
    await Bun.write(join(destination, "modules", "shared", "src", "databases", "SharedDatabase.ts"), databaseTemplate);
    await Bun.write(join(destination, "modules", "shared", "src", "roles.yml"), `${toYaml(rolesConfig)}\n`);
    const snakeName = toSnakeCase(name);
    const dockerComposeContent = dockerComposeTemplate.replace(/{{NAME}}/g, snakeName);
    await Bun.write(join(destination, "modules", "app", "docker-compose.yml"), dockerComposeContent);
    const dockerfileContent = dockerfileTemplate.replace(/{{NAME}}/g, snakeName);
    await Bun.write(join(destination, "modules", "app", "Dockerfile"), dockerfileContent);
    await Bun.write(join(destination, ".dockerignore"), dockerignoreTemplate);
    await Bun.write(join(destination, "modules", "app", "var", ".gitkeep"), "");

    // Initialize app (config files, env, git, husky) before installing deps
    // so that package.json exists at destination when bun add runs
    const appInitCommand = new AppInitCommand();
    await appInitCommand.run({ name, destination, silent: true, appType: "api" });

    // Install dependencies
    const addDeps = Bun.spawn(
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
      { cwd: destination, stdout: "ignore", stderr: "ignore" },
    );
    const depsSpinner = createSpinner("Installing dependencies...");
    await addDeps.exited;
    depsSpinner.stop();

    // Install dev dependencies
    const devDepsSpinner = createSpinner("Installing dev dependencies...");
    const addDevDeps = Bun.spawn(["bun", "add", "-D", "@talosjs/command", "@talosjs/migrations", "@talosjs/seeds"], {
      cwd: destination,
      stdout: "ignore",
      stderr: "ignore",
    });
    await addDevDeps.exited;
    devDepsSpinner.stop();

    // Ensure scripts, workspaces, and lint-staged are preserved after bun add rewrites package.json
    const rootPackagePath = join(destination, "package.json");
    const rootPackage = await Bun.file(rootPackagePath).json();
    const templatePackage = JSON.parse(packageTemplate.replace(/{{NAME}}/g, kebabName));
    rootPackage.scripts ??= templatePackage.scripts;
    rootPackage.workspaces ??= templatePackage.workspaces;
    rootPackage["lint-staged"] ??= templatePackage["lint-staged"];
    await Bun.write(rootPackagePath, `${JSON.stringify(rootPackage, null, 2)}\n`);

    const logger = new TerminalLogger();

    logger.success(`${kebabName} created successfully at ${destination}`, undefined, LOG_OPTIONS);

    logger.info(`\nGet started:\n  cd ${destination}`, undefined, LOG_OPTIONS_PLAIN);

    logger.info("\nStart the app:\n  talos app:start", undefined, LOG_OPTIONS_PLAIN);

    logger.info("Stop the app:\n  talos app:stop", undefined, LOG_OPTIONS_PLAIN);

    logger.info("Build the app:\n  talos app:build", undefined, LOG_OPTIONS_PLAIN);

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
