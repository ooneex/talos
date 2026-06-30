import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { runModuleScripts } from "../utils";

@decorator.command()
export class SeedRunCommand implements ICommand {
  public getName(): string {
    return "seed:run";
  }

  public getDescription(): string {
    return "Run seeds for all modules";
  }

  public async run(options: { drop?: boolean; env?: string }): Promise<void> {
    await runModuleScripts(new TerminalLogger(), {
      binPath: ["bin", "seed", "run.ts"],
      label: "seeds",
      drop: options.drop,
      env: options.env,
    });
  }
}
