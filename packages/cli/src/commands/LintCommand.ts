import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { MonorepoRunCommand } from "./MonorepoRunCommand";

type CommandOptionsType = {
  packages?: string;
  modules?: string;
  logs?: boolean;
  noCache?: boolean;
};

// `lint` is a short alias for `monorepo:run --commands=lint`; it forwards every
// other option untouched.
@decorator.command()
export class LintCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "lint";
  }

  public getDescription(): string {
    return "Alias for monorepo:run --commands=lint — run the lint script across packages and modules with granular caching";
  }

  public async run(options: T): Promise<void> {
    await new MonorepoRunCommand().run({ ...options, commands: "lint" });
  }
}
