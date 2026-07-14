import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { MonorepoRunCommand } from "./MonorepoRunCommand";

type CommandOptionsType = {
  packages?: string;
  modules?: string;
  logs?: boolean;
  noCache?: boolean;
};

// `e2e:run` is an alias for `monorepo:run --commands=e2e`; it forwards every
// other option untouched.
@decorator.command()
export class E2eRunCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "e2e:run";
  }

  public getDescription(): string {
    return "Alias for monorepo:run --commands=e2e — run the e2e script across packages and modules with granular caching";
  }

  public async run(options: T): Promise<void> {
    await new MonorepoRunCommand().run({ ...options, commands: "e2e" });
  }
}
