import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { collectRunnableModules, hasModuleFilter, type RunnableModule, selectModules } from "../runnableModules";
import { LOG_OPTIONS } from "../utils";

@decorator.command()
export class AppStopCommand implements ICommand {
  public getName(): string {
    return "app:stop";
  }

  public getDescription(): string {
    return "Stop the application";
  }

  public async run(options?: {
    api?: boolean | string;
    microservice?: boolean | string;
    spa?: boolean | string;
  }): Promise<void> {
    const logger = new TerminalLogger();
    const cwd = process.cwd();
    const appDir = join(cwd, "modules", "app");
    const packageJsonFile = Bun.file(join(appDir, "package.json"));

    if (!(await packageJsonFile.exists())) {
      logger.error("Module app not found", undefined, LOG_OPTIONS);
      process.exitCode = 1;
      return;
    }

    const filters = { api: options?.api, microservice: options?.microservice, spa: options?.spa };

    // Without a type flag, stop the shared Docker stack defined by the app module.
    if (!hasModuleFilter(filters)) {
      await this.stopModule(logger, appDir);
      return;
    }

    // With `--api`, `--microservice` or `--spa`, narrow to the requested modules and
    // stop the Docker stack of each one that declares its own docker-compose.yml.
    const modules = await collectRunnableModules(join(cwd, "modules"));
    const selected = selectModules(modules, filters);

    const stoppable: RunnableModule[] = [];
    for (const module of selected) {
      if (await Bun.file(join(module.dir, "docker-compose.yml")).exists()) {
        stoppable.push(module);
      }
    }

    if (stoppable.length === 0) {
      logger.error("No matching Docker services to stop", undefined, LOG_OPTIONS);
      process.exitCode = 1;
      return;
    }

    for (const module of stoppable) {
      await this.stopModule(logger, module.dir);
    }
  }

  // Run `docker compose down` in a module directory, reporting success or failure.
  private async stopModule(logger: TerminalLogger, moduleDir: string): Promise<void> {
    const packageJson = await Bun.file(join(moduleDir, "package.json")).json();
    const name = packageJson.name ?? "app";

    logger.info(`Stopping Docker services for ${name}...`, undefined, LOG_OPTIONS);

    const proc = Bun.spawn(["docker", "compose", "down"], {
      cwd: moduleDir,
      stdout: "inherit",
      stderr: "inherit",
    });

    const exitCode = await proc.exited;

    if (exitCode === 0) {
      logger.success(`Docker services stopped for ${name}`, undefined, LOG_OPTIONS);
    } else {
      logger.error(`Failed to stop Docker services for ${name} (exit code: ${exitCode})`, undefined, LOG_OPTIONS);
      process.exitCode = 1;
    }
  }
}
