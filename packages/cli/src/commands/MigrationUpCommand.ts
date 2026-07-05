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
    // Caching is per migration file (version) and lives in the module's
    // `bin/migration/up.ts`; the CLI only forwards the `--no-cache` opt-out.
    await runModuleScripts(new TerminalLogger(), {
      binPath: ["bin", "migration", "up.ts"],
      label: "migrations",
      drop: options.drop,
      noCache: options.noCache,
    });
  }
}
