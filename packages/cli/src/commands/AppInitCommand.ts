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
import { createSpinner, extractYamlComments, LOG_OPTIONS, toYaml } from "../utils";
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
    const { appType } = options;

    if (!name) {
      name = await askName({ message: "Enter application name" });
    }

    const kebabName = toKebabCase(name);

    if (!destination) {
      destination = await askDestination({ message: "Enter destination path", initial: kebabName });
    }

    const packageContent = packageTemplate.replace(/{{NAME}}/g, kebabName);

    await Bun.write(join(destination, ".commitlintrc.ts"), commitlintTemplate);
    await Bun.write(join(destination, ".gitignore"), gitignoreTemplate);
    await Bun.write(join(destination, "biome.jsonc"), biomeTemplate);
    await Bun.write(join(destination, "bunfig.toml"), bunfigTemplate);
    await Bun.write(join(destination, "nx.json"), nxTemplate);
    const packageJsonPath = join(destination, "package.json");
    if (!(await Bun.file(packageJsonPath).exists())) {
      await Bun.write(packageJsonPath, packageContent);
    }
    await Bun.write(join(destination, "README.md"), readmeTemplate.replace(/{{NAME}}/g, kebabName));
    await Bun.write(join(destination, "tsconfig.json"), tsconfigTemplate);
    await Bun.write(join(destination, ".zed", "settings.json"), zedSettingsTemplate);

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

    const envPath =
      appType === "api" ? join(destination, "modules", "shared", ".env.yml") : join(destination, ".env.yml");
    const envComments = extractYamlComments(envContent);
    await Bun.write(envPath, `${toYaml(envData, 0, envComments)}\n`);

    // Install dev dependencies
    const addDevDeps = Bun.spawn(
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
      { cwd: destination, stdout: "ignore", stderr: "ignore" },
    );
    const devDepsSpinner = silent ? null : createSpinner("Installing dev dependencies...");
    await addDevDeps.exited;
    devDepsSpinner?.stop();

    // Initialize git repository
    const gitSpinner = silent ? null : createSpinner("Initializing git repository...");
    const gitInit = Bun.spawn(["git", "init"], { cwd: destination, stdout: "ignore", stderr: "ignore" });
    await gitInit.exited;
    gitSpinner?.stop();

    // Configure husky
    const huskySpinner = silent ? null : createSpinner("Configuring husky...");
    const huskyInit = Bun.spawn(["bunx", "husky", "init"], { cwd: destination, stdout: "ignore", stderr: "ignore" });
    await huskyInit.exited;
    huskySpinner?.stop();

    await Bun.write(join(destination, ".husky", "pre-commit"), "lint-staged");
    await Bun.write(join(destination, ".husky", "commit-msg"), `bunx commitlint --edit "$1"`);

    const runClaudeSkills = await askConfirm({ message: "Add Claude skills?", initial: true });

    if (runClaudeSkills) {
      await new ClaudeInitCommand().run({ cwd: destination });
    }

    const runCodexSkills = await askConfirm({ message: "Add Codex skills?", initial: true });

    if (runCodexSkills) {
      await new CodexInitCommand().run({ cwd: destination });
    }

    if (!silent) {
      const logger = new TerminalLogger();

      logger.success(`${kebabName} initialized successfully at ${destination}`, undefined, LOG_OPTIONS);
    }
  }
}
