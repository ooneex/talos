import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { MonorepoRunCommand } from "./MonorepoRunCommand";

type CommandOptionsType = {
  packages?: string;
  modules?: string;
  logs?: boolean;
  noCache?: boolean;
};

// `build` is a short alias for `monorepo:run --commands=build`; it forwards every
// other option untouched.
@decorator.command()
export class BuildCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "build";
  }

  public getDescription(): string {
    return "Alias for monorepo:run --commands=build — run the build script across packages and modules with granular caching";
  }

  public async run(options: T): Promise<void> {
    await new MonorepoRunCommand().run({ ...options, commands: "build" });
  }
}
