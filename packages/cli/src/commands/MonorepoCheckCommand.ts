import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { MonorepoRunCommand } from "./MonorepoRunCommand";

type CommandOptionsType = {
  packages?: string;
  modules?: string;
  logs?: boolean;
  noCache?: boolean;
};

// The full verification pipeline, run in order: dependencies first, then the
// per-target scripts. `monorepo:run` already sequences one command group after
// another, so listing them here gives install → build → lint → test.
const CHECK_COMMANDS = ["install", "build", "lint", "test"].join(",");

@decorator.command()
export class MonorepoCheckCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "monorepo:check";
  }

  public getDescription(): string {
    return "Run install, build, lint and test across packages and modules with granular caching";
  }

  public async run(options: T): Promise<void> {
    await new MonorepoRunCommand().run({ ...options, commands: CHECK_COMMANDS });
  }
}
