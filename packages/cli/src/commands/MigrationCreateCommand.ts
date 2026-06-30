import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { migrationCreate } from "@talosjs/migrations";
import migrationDownTemplate from "../templates/module/migration.down.txt";
import migrationUpTemplate from "../templates/module/migration.up.txt";
import { ensureModule, LOG_OPTIONS } from "../utils";

type CommandOptionsType = {
  module?: string;
};

@decorator.command()
export class MigrationCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "migration:create";
  }

  public getDescription(): string {
    return "Generate a new migration file";
  }

  public async run(options: T): Promise<void> {
    const { module = "shared" } = options;

    await ensureModule(module);

    const base = join("modules", module);
    const { migrationPath: filePath } = await migrationCreate({
      migrationsDir: join(base, "src", "migrations"),
    });

    // Create bin/migration/up.ts if it doesn't exist
    const binMigrationUpPath = join(process.cwd(), base, "bin", "migration", "up.ts");
    const binMigrationUpFile = Bun.file(binMigrationUpPath);
    if (!(await binMigrationUpFile.exists())) {
      await Bun.write(binMigrationUpPath, migrationUpTemplate.replace(/{{name}}/g, module));
    }

    // Create bin/migration/down.ts if it doesn't exist
    const binMigrationDownPath = join(process.cwd(), base, "bin", "migration", "down.ts");
    const binMigrationDownFile = Bun.file(binMigrationDownPath);
    if (!(await binMigrationDownFile.exists())) {
      await Bun.write(binMigrationDownPath, migrationDownTemplate.replace(/{{name}}/g, module));
    }

    const logger = new TerminalLogger();

    logger.success(`${filePath} created successfully`, undefined, LOG_OPTIONS);
  }
}
