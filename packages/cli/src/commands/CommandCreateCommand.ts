import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { commandCreate, decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { toPascalCase } from "@talosjs/utils/toPascalCase";
import { askConfirm } from "../prompts/askConfirm";
import { askName } from "../prompts/askName";
import commandRunTemplate from "../templates/module/command.run.txt";
import { ensureModule, LOG_OPTIONS } from "../utils";

type CommandOptionsType = {
  name?: string;
  module?: string;
  override?: boolean;
};

@decorator.command()
export class CommandCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "command:create";
  }

  public getDescription(): string {
    return "Generate a new command class";
  }

  public async run(options: T): Promise<void> {
    let { name } = options;
    const { module = "shared", override = false } = options;

    if (!name) {
      name = await askName({ message: "Enter command name" });
    }

    await ensureModule(module);

    const base = join("modules", module);
    const commandDir = join(base, "src", "commands");

    const className = toPascalCase(name).replace(/Command$/, "");
    const commandFilePath = join(process.cwd(), commandDir, `${className}Command.ts`);
    if (!override && (await Bun.file(commandFilePath).exists())) {
      const shouldOverride = await askConfirm({
        message: `Command "${className}Command" already exists. Override it?`,
        initial: false,
      });

      if (!shouldOverride) {
        return;
      }
    }

    const { commandPath: filePath, testPath } = await commandCreate({
      name,
      module,
      commandDir,
      testsDir: join(base, "tests", "commands"),
    });

    // Create bin/command/run.ts if it doesn't exist
    const binCommandRunPath = join(process.cwd(), base, "bin", "command", "run.ts");
    const binCommandRunFile = Bun.file(binCommandRunPath);
    if (!(await binCommandRunFile.exists())) {
      await Bun.write(binCommandRunPath, commandRunTemplate.replace(/{{name}}/g, module));
    }

    const logger = new TerminalLogger();

    logger.success(`${filePath} created successfully`, undefined, LOG_OPTIONS);

    logger.success(`${testPath} created successfully`, undefined, LOG_OPTIONS);
  }
}
