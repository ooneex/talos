import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { scaffoldAgentConfig } from "../agentConfig";
import { askAgentSkills } from "../prompts/askAgentSkills";

type CommandOptionsType = {
  cwd?: string;
  agents?: string[];
};

/**
 * Scaffold the shared AGENTS.md, agent files and skills for one or more coding
 * assistants. When `agents` is omitted the user is prompted to pick which
 * assistants to scaffold; each entry is a config directory (e.g. ".claude").
 */
@decorator.command()
export class AgentSkillsCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "agent:skills:create";
  }

  public getDescription(): string {
    return "Scaffold skills and configuration for coding assistants";
  }

  public async run(options?: T): Promise<void> {
    const agentDirs = options?.agents ?? (await askAgentSkills({ message: "Add skills for which assistants?" }));

    for (const configDir of agentDirs) {
      await scaffoldAgentConfig(configDir, options?.cwd);
    }
  }
}
