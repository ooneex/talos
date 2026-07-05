import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { runModuleScripts } from "../utils";

@decorator.command()
export class MigrationUpCommand implements ICommand {
  public getName(): string {
    return "migration:up";
  }

  public getDescription(): string {
    return "Run migrations for all modules";
  }

  public async run(options: { drop?: boolean; noCache?: boolean }): Promise<void> {
    await runModuleScripts(new TerminalLogger(), {
      binPath: ["bin", "migration", "up.ts"],
      label: "migrations",
      drop: options.drop,
      cache: true,
      noCache: options.noCache,
    });
  }
}
