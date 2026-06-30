import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { toPascalCase } from "@talosjs/utils/toPascalCase";
import { toSnakeCase } from "@talosjs/utils/toSnakeCase";
import pluralize from "pluralize";
import { askConfirm } from "../prompts/askConfirm";
import { askName } from "../prompts/askName";
import { addClassToModule } from "../scaffold";
import testTemplate from "../templates/entity.test.txt";
import template from "../templates/entity.txt";
import { ensureModule, LOG_OPTIONS } from "../utils";

type CommandOptionsType = {
  name?: string;
  module?: string;
  tableName?: string;
  override?: boolean;
};

@decorator.command()
export class EntityCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "entity:create";
  }

  public getDescription(): string {
    return "Generate a new entity class";
  }

  public async run(options: T): Promise<void> {
    let { name, module = "shared", tableName, override = false } = options;

    if (!name) {
      name = await askName({ message: "Enter entity name" });
    }

    name = toPascalCase(name).replace(/Entity$/, "");

    if (!tableName) {
      tableName = toSnakeCase(pluralize(name));
    }

    const content = template.replace(/{{NAME}}/g, name).replace(/{{TABLE_NAME}}/g, tableName);

    await ensureModule(module);

    const base = join("modules", module);
    const entitiesLocalDir = join(base, "src", "entities");
    const entitiesDir = join(process.cwd(), entitiesLocalDir);
    const filePath = join(entitiesDir, `${name}Entity.ts`);

    if (!override && (await Bun.file(filePath).exists())) {
      const shouldOverride = await askConfirm({
        message: `Entity "${name}Entity" already exists. Override it?`,
        initial: false,
      });

      if (!shouldOverride) {
        return;
      }
    }

    await Bun.write(filePath, content);

    // Generate test file
    const testContent = testTemplate.replace(/{{NAME}}/g, name).replace(/{{MODULE}}/g, module);
    const testsLocalDir = join(base, "tests", "entities");
    const testsDir = join(process.cwd(), testsLocalDir);
    const testFilePath = join(testsDir, `${name}Entity.spec.ts`);
    await Bun.write(testFilePath, testContent);

    // Import entity in its module
    const modulePascalName = toPascalCase(module);
    const modulePath = join(process.cwd(), base, "src", `${modulePascalName}Module.ts`);
    if (await Bun.file(modulePath).exists()) {
      await addClassToModule(modulePath, `${name}Entity`, "entities", "entities");
    }

    const logger = new TerminalLogger();

    logger.success(`${join(entitiesLocalDir, name)}Entity.ts created successfully`, undefined, LOG_OPTIONS);

    logger.success(`${join(testsLocalDir, name)}Entity.spec.ts created successfully`, undefined, LOG_OPTIONS);
  }
}
