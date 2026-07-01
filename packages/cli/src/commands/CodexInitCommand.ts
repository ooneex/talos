import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { scaffoldAgentConfig } from "../agentConfig";

type CommandOptionsType = {
  cwd?: string;
};

@decorator.command()
export class CodexInitCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "codex:init";
  }

  public getDescription(): string {
    return "Initialize Codex configuration and skills";
  }

  public async run(options?: T): Promise<void> {
    await scaffoldAgentConfig(".codex", options?.cwd);
  }
}
