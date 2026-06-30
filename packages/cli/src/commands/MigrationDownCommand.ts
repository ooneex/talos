import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { runModuleScripts } from "../utils";

@decorator.command()
export class MigrationDownCommand implements ICommand {
  public getName(): string {
    return "migration:down";
  }

  public getDescription(): string {
    return "Roll back migrations for all modules";
  }

  public async run(options: { version?: string }): Promise<void> {
    await runModuleScripts(new TerminalLogger(), {
      binPath: ["bin", "migration", "down.ts"],
      label: "migrations",
      version: options.version,
    });
  }
}
