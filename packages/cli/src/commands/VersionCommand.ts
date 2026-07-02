import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { getCliVersion } from "../utils";

@decorator.command()
export class VersionCommand implements ICommand {
  public getName(): string {
    return "version";
  }

  public getDescription(): string {
    return "Print the installed CLI version";
  }

  public async run(): Promise<void> {
    const version = await getCliVersion();

    process.stdout.write(`${version}\n`);
  }
}
