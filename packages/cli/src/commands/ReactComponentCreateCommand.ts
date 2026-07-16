import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import { toPascalCase } from "@talosjs/utils/toPascalCase";
import { askConfirm } from "../prompts/askConfirm";
import { askName } from "../prompts/askName";
import componentTemplate from "../templates/react-component.txt";
import { LOG_OPTIONS } from "../utils";

type CommandOptionsType = {
  name?: string;
  module?: string;
  override?: boolean;
};

@decorator.command()
export class ReactComponentCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "react:component:create";
  }

  public getDescription(): string {
    return "Generate a new react component in a module's components folder";
  }

  public async run(options: T): Promise<void> {
    let { name, module, override = false } = options;

    if (!name) {
      name = await askName({ message: "Enter component name" });
    }

    if (!module) {
      module = await askName({ message: "Enter spa module name" });
    }

    // Normalize inputs: PascalCase drives the component/file name, kebab-case drives the module path.
    const pascalName = toPascalCase(name);
    const moduleName = toKebabCase(toPascalCase(module).replace(/Module$/, ""));

    const componentLocalPath = join("modules", moduleName, "src", "components", `${pascalName}.tsx`);
    const componentPath = join(process.cwd(), componentLocalPath);

    if (!override && (await Bun.file(componentPath).exists())) {
      const shouldOverride = await askConfirm({
        message: `Component "${pascalName}" already exists. Override it?`,
        initial: false,
      });

      if (!shouldOverride) {
        return;
      }
    }

    const content = componentTemplate.replace(/{{NAME}}/g, pascalName);

    await Bun.write(componentPath, content);

    const logger = new TerminalLogger();

    logger.success(`${componentLocalPath} created successfully`, undefined, LOG_OPTIONS);
  }
}
