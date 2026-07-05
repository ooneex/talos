import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { SEEDS_CACHE_DIR } from "@talosjs/seeds";
import { runModuleScripts } from "../utils";

@decorator.command()
export class SeedRunCommand implements ICommand {
  public getName(): string {
    return "seed:run";
  }

  public getDescription(): string {
    return "Run seeds for all modules";
  }

  public async run(options: { drop?: boolean; env?: string; noCache?: boolean }): Promise<void> {
    // Caching is per seed and lives in the module's `bin/seed/run.ts`; the CLI
    // points it at a root-level, per-module cache directory and forwards the
    // `--no-cache` opt-out.
    await runModuleScripts(new TerminalLogger(), {
      binPath: ["bin", "seed", "run.ts"],
      label: "seeds",
      drop: options.drop,
      env: options.env,
      noCache: options.noCache,
      cacheDir: SEEDS_CACHE_DIR,
    });
  }
}
