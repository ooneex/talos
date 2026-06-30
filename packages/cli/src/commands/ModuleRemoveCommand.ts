import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import { toPascalCase } from "@talosjs/utils/toPascalCase";
import { removeFromAppModule, removeFromSharedModule, removeModuleScope, removePathAlias } from "../moduleRegistry";
import { askConfirm } from "../prompts/askConfirm";
import { askName } from "../prompts/askName";
import { LOG_OPTIONS } from "../utils";

type CommandOptionsType = {
  name?: string;
  cwd?: string;
  silent?: boolean;
};

@decorator.command()
export class ModuleRemoveCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "module:remove";
  }

  public getDescription(): string {
    return "Remove an existing module";
  }

  public async run(options: T): Promise<void> {
    const { cwd = process.cwd(), silent = false } = options;
    let { name } = options;

    if (!name) {
      name = await askName({ message: "Enter module name to remove" });
    }

    const pascalName = toPascalCase(name).replace(/Module$/, "");
    const kebabName = toKebabCase(pascalName);

    // Prevent removing core modules
    if (kebabName === "app" || kebabName === "shared") {
      if (!silent) {
        const logger = new TerminalLogger();
        logger.error(`Cannot remove the "${kebabName}" module`, undefined, LOG_OPTIONS);
      }
      return;
    }

    const moduleDir = join(cwd, "modules", kebabName);
    const moduleDirExists = await Bun.file(join(moduleDir, "package.json")).exists();

    if (!moduleDirExists) {
      if (!silent) {
        const logger = new TerminalLogger();
        logger.error(`Module "${kebabName}" does not exist`, undefined, LOG_OPTIONS);
      }
      return;
    }

    if (!silent) {
      const confirmed = await askConfirm({
        message: `Are you sure you want to remove the "${kebabName}" module?`,
        initial: false,
      });

      if (!confirmed) return;
    }

    // Remove from AppModule
    const appModulePath = join(cwd, "modules", "app", "src", "AppModule.ts");
    await removeFromAppModule(appModulePath, pascalName, kebabName);

    // Remove from SharedModule
    const sharedModulePath = join(cwd, "modules", "shared", "src", "SharedModule.ts");
    await removeFromSharedModule(sharedModulePath, pascalName, kebabName);

    // Remove path alias from tsconfig
    const appTsconfigPath = join(cwd, "tsconfig.json");
    await removePathAlias(appTsconfigPath, kebabName);

    // Remove module scope from commitlint config
    const commitlintPath = join(cwd, ".commitlintrc.ts");
    await removeModuleScope(commitlintPath, kebabName);

    // Remove the module directory
    await rm(moduleDir, { recursive: true, force: true });

    if (!silent) {
      const logger = new TerminalLogger();
      logger.success(`modules/${kebabName} removed successfully`, undefined, LOG_OPTIONS);
    }
  }
}
