import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import concurrently from "concurrently";
import { collectRunnableModules, type RunnableModuleType, selectRunnableModules } from "../runnableModules";
import { ensureBin, LOG_OPTIONS, loadAppModuleName, spawnStep } from "../utils";

// Distinct prefix color per module type so the interleaved output stays readable.
const PREFIX_COLORS: Record<RunnableModuleType, string> = {
  api: "cyan",
  microservice: "magenta",
  spa: "green",
  storybook: "yellow",
  swagger: "blue",
};

// Module types served by a dev server (`bun run dev`) rather than a hot-reloaded entrypoint.
const DEV_SERVER_TYPES = new Set<RunnableModuleType>(["spa", "storybook", "swagger"]);

// Module types that rely on the app's Docker services (databases, brokers, ...).
const DOCKER_TYPES = new Set<RunnableModuleType>(["api", "microservice"]);

@decorator.command()
export class AppStartCommand implements ICommand {
  public getName(): string {
    return "app:start";
  }

  public getDescription(): string {
    return "Start the application";
  }

  public async run(options?: { modules?: boolean | string; packages?: boolean | string }): Promise<void> {
    const logger = new TerminalLogger();
    const cwd = process.cwd();
    const appDir = join(cwd, "modules", "app");
    const name = await loadAppModuleName(appDir);

    if (name === null) {
      logger.error("Module app not found", undefined, LOG_OPTIONS);
      process.exitCode = 1;
      return;
    }

    // Discover the runnable modules to run together
    const modules = await collectRunnableModules(join(cwd, "modules"));

    if (modules.length === 0) {
      logger.error("No runnable modules found", undefined, LOG_OPTIONS);
      process.exitCode = 1;
      return;
    }

    // Optionally narrow down to the modules named with `--modules` or `--packages`
    // (aliases, e.g. `--modules=a,b`). Without a name flag every module runs.
    const selected = selectRunnableModules(modules, options);

    if (selected.length === 0) {
      logger.error("No matching modules found", undefined, LOG_OPTIONS);
      process.exitCode = 1;
      return;
    }

    // Start Docker services (defined in the app module) before running the modules, but
    // only when an api or microservice module is running — dev-server modules don't need them.
    const needsDocker = selected.some((module) => DOCKER_TYPES.has(module.type));
    const composeExists = needsDocker && (await Bun.file(join(appDir, "docker-compose.yml")).exists());

    if (composeExists) {
      if (!ensureBin(logger, "docker")) {
        return;
      }
      const started = await spawnStep(logger, ["docker", "compose", "up", "-d"], appDir, {
        start: `Starting Docker services for ${name}...`,
        success: `Docker services started for ${name}`,
        failure: (exitCode) => `Docker services failed for ${name} (exit code: ${exitCode})`,
      });

      if (!started) return;
    }

    // Run every module concurrently: api and microservice modules serve their
    // entrypoint with hot reload, spa/storybook/swagger modules run their dev server.
    const commands = selected.map((module) => {
      const devServer = DEV_SERVER_TYPES.has(module.type);

      return {
        name: module.name,
        prefixColor: PREFIX_COLORS[module.type],
        cwd: devServer ? module.dir : cwd,
        command: devServer ? "bun run dev" : `bun --hot run ${join(module.dir, "src", "index.ts")}`,
      };
    });

    logger.info(`Starting ${selected.map((module) => module.name).join(", ")}...`, undefined, LOG_OPTIONS);

    const { result } = concurrently(commands, {
      prefix: "name",
      killOthersOn: ["failure"],
    });

    try {
      await result;
    } catch {
      process.exitCode = 1;
    }
  }
}
