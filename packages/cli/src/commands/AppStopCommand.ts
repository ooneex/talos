import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { collectRunnableModules, type RunnableModuleType } from "../runnableModules";
import { ensureBin, LOG_OPTIONS, spawnStep } from "../utils";

// Module types that rely on the app's Docker services (databases, brokers, ...).
const DOCKER_TYPES = new Set<RunnableModuleType>(["api", "microservice"]);

@decorator.command()
export class AppStopCommand implements ICommand {
  public getName(): string {
    return "app:stop";
  }

  public getDescription(): string {
    return "Stop the application";
  }

  public async run(options?: { modules?: boolean | string; packages?: boolean | string }): Promise<void> {
    const logger = new TerminalLogger();
    const cwd = process.cwd();
    const appDir = join(cwd, "modules", "app");
    const packageJsonFile = Bun.file(join(appDir, "package.json"));

    if (!(await packageJsonFile.exists())) {
      logger.error("Module app not found", undefined, LOG_OPTIONS);
      process.exitCode = 1;
      return;
    }

    if (!ensureBin(logger, "docker")) {
      return;
    }

    // Discover the runnable modules and narrow to those named with `--modules` or
    // `--packages` (aliases, e.g. `--modules=a,b`). Without a name flag every module counts.
    const modules = await collectRunnableModules(join(cwd, "modules"));
    const requested = [options?.modules, options?.packages]
      .filter((value): value is string => typeof value === "string")
      .flatMap((value) =>
        value
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean),
      );

    const selected = requested.length === 0 ? modules : modules.filter((module) => requested.includes(module.name));

    // The Docker services (defined in the app module) are only relevant to api and
    // microservice modules; stop them only when one of those is in scope.
    const needsDocker = selected.some((module) => DOCKER_TYPES.has(module.type));
    const composeExists = needsDocker && (await Bun.file(join(appDir, "docker-compose.yml")).exists());

    if (!composeExists) {
      logger.error("No matching Docker services to stop", undefined, LOG_OPTIONS);
      process.exitCode = 1;
      return;
    }

    await this.stopModule(logger, appDir);
  }

  // Run `docker compose down` in a module directory, reporting success or failure.
  private async stopModule(logger: TerminalLogger, moduleDir: string): Promise<void> {
    const packageJson = await Bun.file(join(moduleDir, "package.json")).json();
    const name = packageJson.name ?? "app";

    await spawnStep(logger, ["docker", "compose", "down"], moduleDir, {
      start: `Stopping Docker services for ${name}...`,
      success: `Docker services stopped for ${name}`,
      failure: (exitCode) => `Failed to stop Docker services for ${name} (exit code: ${exitCode})`,
    });
  }
}
