import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { MonorepoCheckCommand } from "./MonorepoCheckCommand";

type CommandOptionsType = {
  packages?: string;
  modules?: string;
  logs?: boolean;
  noCache?: boolean;
};

// `check` is a short alias for `monorepo:check`; it forwards every option untouched.
@decorator.command()
export class CheckCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "check";
  }

  public getDescription(): string {
    return "Alias for monorepo:check — run install, build, fmt, lint and test across packages and modules with granular caching";
  }

  public async run(options: T): Promise<void> {
    await new MonorepoCheckCommand().run(options);
  }
}
