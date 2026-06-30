import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { seedCreate } from "@talosjs/seeds";
import { askName } from "../prompts/askName";
import seedRunTemplate from "../templates/module/seed.run.txt";
import { ensureModule, LOG_OPTIONS } from "../utils";

type CommandOptionsType = {
  name?: string;
  module?: string;
};

@decorator.command()
export class SeedCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "seed:create";
  }

  public getDescription(): string {
    return "Generate a new seed file";
  }

  public async run(options: T): Promise<void> {
    let { name, module = "shared" } = options;

    if (!name) {
      name = await askName({ message: "Enter seed name" });
    }

    await ensureModule(module);

    const base = join("modules", module);
    const {
      seedPath: filePath,
      dataPath,
      testPath,
    } = await seedCreate({
      name,
      seedsDir: join(base, "src", "seeds"),
      testsDir: join(base, "tests", "seeds"),
      module,
    });

    // Create bin/seed/run.ts if it doesn't exist
    const binSeedRunPath = join(process.cwd(), base, "bin", "seed", "run.ts");
    const binSeedRunFile = Bun.file(binSeedRunPath);
    if (!(await binSeedRunFile.exists())) {
      await Bun.write(binSeedRunPath, seedRunTemplate.replace(/{{name}}/g, module));
    }

    const logger = new TerminalLogger();

    logger.success(`${filePath} created successfully`, undefined, LOG_OPTIONS);
    logger.success(`${dataPath} created successfully`, undefined, LOG_OPTIONS);
    logger.success(`${testPath} created successfully`, undefined, LOG_OPTIONS);
  }
}
