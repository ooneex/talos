import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { LOG_OPTIONS, loadAppModuleName, spawnStep } from "../utils";

@decorator.command()
export class AppBuildCommand implements ICommand {
  public getName(): string {
    return "app:build";
  }

  public getDescription(): string {
    return "Build the application";
  }

  public async run(): Promise<void> {
    const logger = new TerminalLogger();
    const appDir = join(process.cwd(), "modules", "app");
    const name = await loadAppModuleName(appDir);

    if (name === null) {
      logger.error("Module app not found", undefined, LOG_OPTIONS);
      process.exitCode = 1;
      return;
    }

    await spawnStep(logger, ["bun", "build", "./src/index.ts", "--outdir", "./dist", "--target", "bun"], appDir, {
      start: `Building ${name}...`,
      success: `Build completed for ${name}`,
      failure: (exitCode) => `Build failed for ${name} (exit code: ${exitCode})`,
    });
  }
}
