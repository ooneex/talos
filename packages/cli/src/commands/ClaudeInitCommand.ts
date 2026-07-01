import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { scaffoldAgentConfig } from "../agentConfig";

type CommandOptionsType = {
  cwd?: string;
};

@decorator.command()
export class ClaudeInitCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "claude:init";
  }

  public getDescription(): string {
    return "Initialize Claude configuration and skills";
  }

  public async run(options?: T): Promise<void> {
    await scaffoldAgentConfig(".claude", options?.cwd);
  }
}
