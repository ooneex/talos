import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { toPascalCase } from "@talosjs/utils/toPascalCase";
import { askConfirm } from "../prompts/askConfirm";
import { askName } from "../prompts/askName";
import testTemplate from "../templates/repository.test.txt";
import template from "../templates/repository.txt";
import { ensureModule, LOG_OPTIONS, spawnStep } from "../utils";

type CommandOptionsType = {
  name?: string;
  module?: string;
  override?: boolean;
};

@decorator.command()
export class RepositoryCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "repository:create";
  }

  public getDescription(): string {
    return "Generate a new repository class";
  }

  public async run(options: T): Promise<void> {
    let { name, module = "shared", override = false } = options;

    if (!name) {
      name = await askName({ message: "Enter repository name" });
    }

    // Normalize inputs
    name = toPascalCase(name).replace(/Repository$/, "");

    const content = template.replace(/{{NAME}}/g, name);

    await ensureModule(module);

    const base = join("modules", module);
    const repositoriesLocalDir = join(base, "src", "repositories");
    const repositoriesDir = join(process.cwd(), repositoriesLocalDir);
    const filePath = join(repositoriesDir, `${name}Repository.ts`);

    if (!override && (await Bun.file(filePath).exists())) {
      const shouldOverride = await askConfirm({
        message: `Repository "${name}Repository" already exists. Override it?`,
        initial: false,
      });

      if (!shouldOverride) {
        return;
      }
    }

    await Bun.write(filePath, content);

    // Generate test file
    const testContent = testTemplate.replace(/{{NAME}}/g, name).replace(/{{MODULE}}/g, module);
    const testsLocalDir = join(base, "tests", "repositories");
    const testsDir = join(process.cwd(), testsLocalDir);
    const testFilePath = join(testsDir, `${name}Repository.spec.ts`);
    await Bun.write(testFilePath, testContent);

    const logger = new TerminalLogger();

    logger.success(`${join(repositoriesLocalDir, name)}Repository.ts created successfully`, undefined, LOG_OPTIONS);

    logger.success(`${join(testsLocalDir, name)}Repository.spec.ts created successfully`, undefined, LOG_OPTIONS);

    // Install @talosjs/repository dependency if not already installed
    const packageJsonPath = join(process.cwd(), "package.json");
    const packageJson = await Bun.file(packageJsonPath).json();
    const deps = packageJson.dependencies ?? {};
    const devDeps = packageJson.devDependencies ?? {};

    if (!deps["@talosjs/repository"] && !devDeps["@talosjs/repository"]) {
      await spawnStep(logger, ["bun", "add", "@talosjs/repository"], process.cwd(), {
        start: "Installing @talosjs/repository...",
        failure: (exitCode) => `Failed to install @talosjs/repository (exit code: ${exitCode})`,
      });
    }
  }
}
