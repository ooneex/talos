import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import concurrently from "concurrently";
import { collectRunnableModules, type RunnableModuleType, selectModules } from "../runnableModules";
import { ensureBin, LOG_OPTIONS, loadAppModuleName, spawnStep } from "../utils";

// Distinct prefix color per module type so the interleaved output stays readable.
const PREFIX_COLORS: Record<RunnableModuleType, string> = {
  api: "cyan",
  microservice: "magenta",
  spa: "green",
};

@decorator.command()
export class AppStartCommand implements ICommand {
  public getName(): string {
    return "app:start";
  }

  public getDescription(): string {
    return "Start the application";
  }

  public async run(options?: {
    api?: boolean | string;
    microservice?: boolean | string;
    spa?: boolean | string;
  }): Promise<void> {
    const logger = new TerminalLogger();
    const cwd = process.cwd();
    const appDir = join(cwd, "modules", "app");
    const name = await loadAppModuleName(appDir);

    if (name === null) {
      logger.error("Module app not found", undefined, LOG_OPTIONS);
      process.exitCode = 1;
      return;
    }

    // Start Docker services (defined in the app module) before running the modules
    const composeExists = await Bun.file(join(appDir, "docker-compose.yml")).exists();

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

    // Discover the spa, microservice and api modules to run together
    const modules = await collectRunnableModules(join(cwd, "modules"));

    if (modules.length === 0) {
      logger.error("No spa, microservice or api modules found", undefined, LOG_OPTIONS);
      process.exitCode = 1;
      return;
    }

    // Optionally narrow down to the modules requested with `--api`, `--microservice` or `--spa`.
    const selected = selectModules(modules, {
      api: options?.api,
      microservice: options?.microservice,
      spa: options?.spa,
    });

    if (selected.length === 0) {
      logger.error("No matching modules found", undefined, LOG_OPTIONS);
      process.exitCode = 1;
      return;
    }

    // Run every module concurrently: api and microservice modules serve their
    // entrypoint with hot reload, spa modules run their dev server.
    const commands = selected.map((module) => ({
      name: module.name,
      prefixColor: PREFIX_COLORS[module.type],
      cwd: module.type === "spa" ? module.dir : cwd,
      command: module.type === "spa" ? "bun run dev" : `bun --hot run ${join(module.dir, "src", "index.ts")}`,
    }));

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
