import { cpSync } from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import { getSkeletonDir, resetSkeletonDirCache } from "../agentConfig";
import { askConfirm } from "../prompts/askConfirm";
import { askDestination } from "../prompts/askDestination";
import { askName } from "../prompts/askName";
import { ensureBin, LOG_OPTIONS, spawnStep } from "../utils";
import { AgentSkillsCreateCommand } from "./AgentSkillsCreateCommand";
import { CommitlintInitCommand } from "./CommitlintInitCommand";

type CommandOptionsType = {
  name?: string;
  destination?: string;
  silent?: boolean;
  appType?: "cli" | "api";
};

@decorator.command()
export class AppInitCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "app:init";
  }

  public getDescription(): string {
    return "Initialize an application";
  }

  public async run(options: T): Promise<void> {
    let { name, destination, silent, appType } = options;
    const logger = new TerminalLogger();

    if (!name) {
      name = await askName({ message: "Enter application name" });
    }

    const kebabName = toKebabCase(name);

    if (!destination) {
      destination = await askDestination({ message: "Enter destination path", initial: kebabName });
    }

    const skeletonDir = await getSkeletonDir(logger, silent);
    if (!skeletonDir) return;

    cpSync(skeletonDir, destination, { recursive: true, force: true });

    await rm(dirname(skeletonDir), { recursive: true, force: true });
    resetSkeletonDirCache();

    await rm(join(destination, ".git"), { recursive: true, force: true });
    await rm(join(destination, "bun.lock"), { force: true });

    const envExamplePath = join(destination, ".env.example.yml");
    await Bun.write(join(destination, ".env.yml"), await Bun.file(envExamplePath).text());
    await rm(envExamplePath, { force: true });

    const readmePath = join(destination, "README.md");
    const readme = await Bun.file(readmePath).text();
    await Bun.write(readmePath, readme.replace(/^# .+/, `# ${kebabName}`));

    if (appType === "cli") {
      const modulesDir = join(destination, "modules");
      await rm(modulesDir, { recursive: true, force: true });
      await mkdir(modulesDir, { recursive: true });

      await rm(join(destination, ".dockerignore"), { force: true });
    }

    if (appType === "api") {
      const modulesDir = join(destination, "modules");
      const keptModules = new Set(["app", "shared"]);
      const moduleEntries = await readdir(modulesDir, { withFileTypes: true });
      await Promise.all(
        moduleEntries
          .filter((entry) => entry.isDirectory() && !keptModules.has(entry.name))
          .map((entry) => rm(join(modulesDir, entry.name), { recursive: true, force: true })),
      );
    }

    const depsInstalled = await spawnStep(
      logger,
      ["bun", "install"],
      destination,
      {
        start: "Installing dependencies...",
        failure: (exitCode) => `Failed to install dependencies (exit code: ${exitCode})`,
      },
      { silent },
    );
    if (!depsInstalled) return;

    if (!ensureBin(logger, "git", silent)) {
      return;
    }

    const gitInitialized = await spawnStep(
      logger,
      ["git", "init"],
      destination,
      {
        start: "Initializing git repository...",
        failure: (exitCode) => `Failed to initialize git repository (exit code: ${exitCode})`,
      },
      { silent },
    );
    if (!gitInitialized) return;

    const runCommitlintHook = await askConfirm({ message: "Install the commit-msg hook?", initial: true });

    if (runCommitlintHook) {
      await new CommitlintInitCommand().run({ cwd: destination });
    }

    await new AgentSkillsCreateCommand().run({
      cwd: destination,
      name: kebabName,
      ...(silent !== undefined ? { silent } : {}),
    });

    if (!silent) {
      logger.success(`${kebabName} initialized successfully at ${destination}`, undefined, LOG_OPTIONS);
    }
  }
}
