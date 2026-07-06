import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { MonorepoRunCommand } from "./MonorepoRunCommand";

type CommandOptionsType = {
  packages?: string;
  modules?: string;
  logs?: boolean;
  noCache?: boolean;
};

// `fmt` is a short alias for `monorepo:run --commands=fmt`; it forwards every
// other option untouched.
@decorator.command()
export class FmtCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "fmt";
  }

  public getDescription(): string {
    return "Alias for monorepo:run --commands=fmt — run the fmt script across packages and modules with granular caching";
  }

  public async run(options: T): Promise<void> {
    await new MonorepoRunCommand().run({ ...options, commands: "fmt" });
  }
}
