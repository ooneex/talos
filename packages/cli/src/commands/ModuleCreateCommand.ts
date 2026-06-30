import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import { toPascalCase } from "@talosjs/utils/toPascalCase";
import {
  addModuleScope,
  addPathAlias,
  addToAppModule,
  addToMicroserviceModule,
  addToSharedModule,
} from "../moduleRegistry";
import { askDestinationModule } from "../prompts/askDestinationModule";
import { askName } from "../prompts/askName";
import moduleTemplate from "../templates/module/module.txt";
import packageTemplate from "../templates/module/package.txt";
import testTemplate from "../templates/module/test.txt";
import tsconfigTemplate from "../templates/module/tsconfig.txt";
import ymlTemplate from "../templates/module/yml.txt";
import { LOG_OPTIONS } from "../utils";

type CommandOptionsType = {
  name?: string;
  destination?: string;
  cwd?: string;
  silent?: boolean;
};

@decorator.command()
export class ModuleCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "module:create";
  }

  public getDescription(): string {
    return "Generate a new module";
  }

  public async run(options: T): Promise<void> {
    const { cwd = process.cwd(), silent = false } = options;
    let { name, destination } = options;

    if (!name) {
      name = await askName({ message: "Enter module name" });
    }

    if (!destination) {
      destination = silent ? "app" : await askDestinationModule({ cwd, message: "Select destination module" });
    }
    const destinationKebab = toKebabCase(destination);

    const pascalName = toPascalCase(name).replace(/Module$/, "");
    const kebabName = toKebabCase(pascalName);

    const moduleDir = join(cwd, "modules", kebabName);
    const srcDir = join(moduleDir, "src");
    const testsDir = join(moduleDir, "tests");

    const moduleContent = moduleTemplate.replace(/{{NAME}}/g, pascalName);
    const packageContent = packageTemplate.replace(/{{NAME}}/g, kebabName);
    const testContent = testTemplate.replace(/{{NAME}}/g, pascalName).replace(/{{name}}/g, kebabName);

    await Bun.write(join(srcDir, `${pascalName}Module.ts`), moduleContent);
    await Bun.write(join(moduleDir, "package.json"), packageContent);
    await Bun.write(join(moduleDir, "tsconfig.json"), tsconfigTemplate);
    await Bun.write(join(moduleDir, `${kebabName}.yml`), ymlTemplate.replace(/{{name}}/g, kebabName));
    await Bun.write(join(testsDir, `${pascalName}Module.spec.ts`), testContent);

    // Register the module into its destination. For `app` the module is added to
    // both AppModule and SharedModule (entities); for any other destination it is
    // registered only into that destination module.
    if (kebabName !== destinationKebab) {
      if (destinationKebab === "app") {
        const appModulePath = join(cwd, "modules", "app", "src", "AppModule.ts");
        if (await Bun.file(appModulePath).exists()) {
          await addToAppModule(appModulePath, pascalName, kebabName);
        }

        if (kebabName !== "shared") {
          const sharedModuleFilePath = join(cwd, "modules", "shared", "src", "SharedModule.ts");
          if (await Bun.file(sharedModuleFilePath).exists()) {
            await addToSharedModule(sharedModuleFilePath, pascalName, kebabName);
          }
        }
      } else {
        const destinationPascal = toPascalCase(destinationKebab);
        const destinationModulePath = join(cwd, "modules", destinationKebab, "src", `${destinationPascal}Module.ts`);
        if (await Bun.file(destinationModulePath).exists()) {
          await addToMicroserviceModule(destinationModulePath, pascalName, kebabName);
        }
      }
    }

    // Add path alias in app module tsconfig
    const appTsconfigPath = join(cwd, "tsconfig.json");
    if (await Bun.file(appTsconfigPath).exists()) {
      await addPathAlias(appTsconfigPath, kebabName);
    }

    // Add module scope to commitlint config if it exists
    const commitlintPath = join(cwd, ".commitlintrc.ts");
    if (await Bun.file(commitlintPath).exists()) {
      await addModuleScope(commitlintPath, kebabName);
    }

    if (!silent) {
      const logger = new TerminalLogger();

      logger.success(`modules/${kebabName} created successfully`, undefined, LOG_OPTIONS);
    }
  }
}
