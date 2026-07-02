import { join } from "node:path";
import { envConfig, envContent } from "@talosjs/app-env";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import { askConfirm } from "../prompts/askConfirm";
import { askDestination } from "../prompts/askDestination";
import { askName } from "../prompts/askName";
import commitlintTemplate from "../templates/app/.commitlintrc.ts.txt";
import gitignoreTemplate from "../templates/app/.gitignore.txt";
import biomeTemplate from "../templates/app/biome.jsonc.txt";
import bunfigTemplate from "../templates/app/bunfig.toml.txt";
import nxTemplate from "../templates/app/nx.json.txt";
import packageTemplate from "../templates/app/package.json.txt";
import readmeTemplate from "../templates/app/README.md.txt";
import tsconfigTemplate from "../templates/app/tsconfig.json.txt";
import zedSettingsTemplate from "../templates/app/zed-settings.json.txt";
import { extractYamlComments, LOG_OPTIONS, spawnStep, toYaml } from "../utils";
import { ClaudeInitCommand } from "./ClaudeInitCommand";
import { CodexInitCommand } from "./CodexInitCommand";

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

    const packageContent = packageTemplate.replace(/{{NAME}}/g, kebabName);
    const packageJsonPath = join(destination, "package.json");
    const packageJsonExists = await Bun.file(packageJsonPath).exists();

    // These project files target independent paths, so write them concurrently.
    await Promise.all([
      Bun.write(join(destination, ".commitlintrc.ts"), commitlintTemplate),
      Bun.write(join(destination, ".gitignore"), gitignoreTemplate),
      Bun.write(join(destination, "biome.jsonc"), biomeTemplate),
      Bun.write(join(destination, "bunfig.toml"), bunfigTemplate),
      Bun.write(join(destination, "nx.json"), nxTemplate),
      Bun.write(join(destination, "README.md"), readmeTemplate.replace(/{{NAME}}/g, kebabName)),
      Bun.write(join(destination, "tsconfig.json"), tsconfigTemplate),
      Bun.write(join(destination, ".zed", "settings.json"), zedSettingsTemplate),
      Bun.write(join(destination, "var", ".gitkeep"), ""),
      ...(packageJsonExists ? [] : [Bun.write(packageJsonPath, packageContent)]),
    ]);

    const envData = structuredClone(envConfig) as {
      analytics?: unknown;
      cache: { redis: { url: string } };
      pubsub: { redis: { url: string } };
      rate_limit: { redis: { url: string } };
      queue: { redis: { url: string } };
      database: { url: string; redis: { url: string } };
      [key: string]: unknown;
    };

    delete envData.analytics;

    envData.cache.redis.url = "redis://localhost:6379";
    envData.pubsub.redis.url = "redis://localhost:6379";
    envData.rate_limit.redis.url = "redis://localhost:6379";
    envData.queue.redis.url = "redis://localhost:6379";
    envData.database.url = "postgresql://talos:talos@localhost:5432/talos";
    envData.database.redis.url = "redis://localhost:6379";

    const envComments = extractYamlComments(envContent);
    await Bun.write(join(destination, ".env.yml"), `${toYaml(envData, 0, envComments)}\n`);

    // Install dev dependencies
    const devDepsInstalled = await spawnStep(
      logger,
      [
        "bun",
        "add",
        "-D",
        "@biomejs/biome",
        "@commitlint/cli",
        "@commitlint/config-conventional",
        "@commitlint/prompt-cli",
        "@commitlint/types",
        "@types/bun",
        "@types/node",
        "@types/react",
        "@types/react-dom",
        "@typescript/native-preview@beta",
        "husky",
        "lint-staged",
        "nx",
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

    // Initialize git repository
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

    // Configure husky
    const huskyConfigured = await spawnStep(
      logger,
      ["bunx", "husky", "init"],
      destination,
      {
        start: "Configuring husky...",
        failure: (exitCode) => `Failed to configure husky (exit code: ${exitCode})`,
      },
      { silent },
    );
    if (!huskyConfigured) return;

    await Promise.all([
      Bun.write(join(destination, ".husky", "pre-commit"), "lint-staged"),
      Bun.write(join(destination, ".husky", "commit-msg"), `bunx commitlint --edit "$1"`),
    ]);

    const runClaudeSkills = await askConfirm({ message: "Add Claude skills?", initial: true });

    if (runClaudeSkills) {
      await new ClaudeInitCommand().run({ cwd: destination });
    }

    const runCodexSkills = await askConfirm({ message: "Add Codex skills?", initial: true });

    if (runCodexSkills) {
      await new CodexInitCommand().run({ cwd: destination });
    }

    if (!silent) {
      logger.success(`${kebabName} initialized successfully at ${destination}`, undefined, LOG_OPTIONS);
    }
  }
}
