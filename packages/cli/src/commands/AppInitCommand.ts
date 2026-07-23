import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import { copySkeletonPath, getSkeletonDir, readSkeletonFile } from "../agentConfig";
import { askConfirm } from "../prompts/askConfirm";
import { askDestination } from "../prompts/askDestination";
import { askName } from "../prompts/askName";
import packageTemplate from "../templates/app/package.json.txt";
import readmeTemplate from "../templates/app/README.md.txt";
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
    let { name, destination, silent } = options;
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

    const packageContent = packageTemplate.replace(/{{NAME}}/g, kebabName);
    const packageJsonPath = join(destination, "package.json");
    const packageJsonExists = await Bun.file(packageJsonPath).exists();
    const tsconfig = JSON.parse(await readSkeletonFile(skeletonDir, "tsconfig.json")) as {
      compilerOptions?: { paths?: Record<string, string[]> };
    };
    const sourcePaths = tsconfig.compilerOptions?.paths ?? {};

    tsconfig.compilerOptions ??= {};
    tsconfig.compilerOptions.paths = {
      "@module/app/*": sourcePaths["@module/app/*"] ?? ["./modules/app/src/*"],
      "@module/shared/*": sourcePaths["@module/shared/*"] ?? ["./modules/shared/src/*"],
    };

    const envExampleContent = await readSkeletonFile(skeletonDir, ".env.example.yml");

    await Promise.all([
      copySkeletonPath(skeletonDir, ".gitignore", join(destination, ".gitignore")),
      copySkeletonPath(skeletonDir, "biome.jsonc", join(destination, "biome.jsonc")),
      Bun.write(join(destination, "README.md"), readmeTemplate.replace(/{{NAME}}/g, kebabName)),
      Bun.write(join(destination, "tsconfig.json"), `${JSON.stringify(tsconfig, null, 2)}\n`),
      copySkeletonPath(skeletonDir, ".zed/settings.json", join(destination, ".zed", "settings.json")),
      Bun.write(join(destination, ".env.example.yml"), envExampleContent),
      Bun.write(join(destination, ".env.yml"), envExampleContent),
      Bun.write(join(destination, "var", ".gitkeep"), ""),
      ...(packageJsonExists ? [] : [Bun.write(packageJsonPath, packageContent)]),
    ]);

    const devDepsInstalled = await spawnStep(
      logger,
      [
        "bun",
        "add",
        "-D",
        "@biomejs/biome",
        "@types/bun",
        "@types/node",
        "@types/react",
        "@types/react-dom",
        "@talosjs/cli",
        "typescript",
        "undici-types",
      ],
      destination,
      {
        start: "Installing dev dependencies...",
        failure: (exitCode) => `Failed to install dev dependencies (exit code: ${exitCode})`,
      },
      { silent },
    );
    if (!devDepsInstalled) return;

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
