import type { ICommand } from "@talosjs/command";
import { COMMANDS_CONTAINER, decorator } from "@talosjs/command";

@decorator.command()
export class HelpCommand implements ICommand {
  public getName(): string {
    return "help";
  }

  public getDescription(): string {
    return "Show available commands";
  }

  public run(): void {
    const commands: { name: string; description: string }[] = [];

    for (const CommandClass of COMMANDS_CONTAINER) {
      const command = new CommandClass();
      commands.push({ name: command.getName(), description: command.getDescription() });
    }

    commands.sort((a, b) => a.name.localeCompare(b.name));

    const maxNameLength = Math.max(...commands.map((c) => c.name.length));

    const lines: string[] = ["", "Available commands:", ""];

    for (const { name, description } of commands) {
      lines.push(`  ${name.padEnd(maxNameLength + 2)}${description}`);
    }

    lines.push("");

    process.stdout.write(`${lines.join("\n")}\n`);
  }
}
