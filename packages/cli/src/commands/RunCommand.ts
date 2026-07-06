import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { MonorepoRunCommand } from "./MonorepoRunCommand";

type CommandOptionsType = {
  commands?: string;
  packages?: string;
  modules?: string;
  logs?: boolean;
  noCache?: boolean;
};

// `run` is a short alias for `monorepo:run`; it forwards every option untouched.
@decorator.command()
export class RunCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "run";
  }

  public getDescription(): string {
    return "Alias for monorepo:run — run package.json scripts across packages and modules with granular caching";
  }

  public async run(options: T): Promise<void> {
    await new MonorepoRunCommand().run(options);
  }
}
