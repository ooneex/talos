import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { LOG_OPTIONS_PLAIN } from "../utils";

const commandNamePattern = /getName\(\)\s*(?::\s*string)?\s*{\s*return\s*["']([^"']+)["'];?\s*}/;

type CommandOptionsType = {
  id?: string;
  args?: string[];
};

@decorator.command()
export class CommandRunCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "command:run";
  }

  public getDescription(): string {
    return "Run a custom command from a module";
  }

  public async run(options?: T): Promise<void> {
    const logger = new TerminalLogger();
    const commandName = options?.id ?? Bun.argv[3];

    if (!commandName) {
      logger.error("Command name is required. Usage: talos command:run <command-name>", undefined, LOG_OPTIONS_PLAIN);
      process.exitCode = 1;
      return;
    }

    const extraArgs = options?.args ?? Bun.argv.slice(4);
    const modulesDir = join(process.cwd(), "modules");

    if (!existsSync(modulesDir)) {
      logger.warn(`Command "${commandName}" not found in any module`, undefined, LOG_OPTIONS_PLAIN);
      return;
    }

    const glob = new Bun.Glob("*/package.json");
    const modules: { name: string; dir: string; confirmed: boolean }[] = [];

    for await (const match of glob.scan({ cwd: modulesDir, onlyFiles: true })) {
      const entry = match.replace("/package.json", "");
      const moduleDir = join(modulesDir, entry);
      const commandRunFile = Bun.file(join(moduleDir, "bin", "command", "run.ts"));

      if (await commandRunFile.exists()) {
        const commandFiles = new Bun.Glob("src/commands/**/*Command.ts");
        let hasCommandFiles = false;
        let hasCommand = false;

        for await (const commandFilePath of commandFiles.scan({ cwd: moduleDir, onlyFiles: true })) {
          hasCommandFiles = true;
          const commandFile = Bun.file(join(moduleDir, commandFilePath));
          const commandNameMatch = (await commandFile.text()).match(commandNamePattern);

          if (commandNameMatch?.[1] === commandName) {
            hasCommand = true;
            break;
          }
        }

        if (hasCommandFiles && !hasCommand) {
          continue;
        }

        const packageJson = await Bun.file(join(modulesDir, match)).json();
        modules.push({ name: packageJson.name ?? entry, dir: moduleDir, confirmed: hasCommand });
      }
    }

    if (modules.length === 0) {
      logger.warn(`Command "${commandName}" not found in any module`, undefined, LOG_OPTIONS_PLAIN);
      process.exitCode = 1;
      return;
    }

    for (const { name, dir, confirmed } of modules) {
      const commandRunPath = join(dir, "bin", "command", "run.ts");

      logger.info(`Running "${commandName}" for ${name}...`, undefined, LOG_OPTIONS_PLAIN);

      const proc = Bun.spawn(["bun", "run", commandRunPath, commandName, ...extraArgs], {
        cwd: process.cwd(),
        stdout: "inherit",
        stderr: "pipe",
      });

      const stderrPromise = new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      const errorOutput = await stderrPromise;
      const trimmed = errorOutput.trim();

      if (exitCode === 0) {
        logger.success(`Command "${commandName}" completed for ${name}`, undefined, LOG_OPTIONS_PLAIN);
        return;
      }

      if (confirmed) {
        logger.error(
          `Command "${commandName}" failed in ${name} (exit code: ${exitCode})`,
          trimmed ? { message: trimmed } : undefined,
          LOG_OPTIONS_PLAIN,
        );
        process.exitCode = 1;
        return;
      }

      logger.warn(
        `Command "${commandName}" not found in ${name}`,
        trimmed ? { message: trimmed } : undefined,
        LOG_OPTIONS_PLAIN,
      );
    }

    logger.error(`Command "${commandName}" not found in any module`, undefined, LOG_OPTIONS_PLAIN);
    process.exitCode = 1;
  }
}
