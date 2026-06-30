import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { agents } from "../templates/llm/agents";
import { agentsMd, skills } from "../templates/llm/skills";
import { LOG_OPTIONS } from "../utils";

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
    const cwd = options?.cwd ?? process.cwd();
    const claudeLocalDir = ".claude";
    const skillsLocalDir = join(claudeLocalDir, "skills");
    const skillsDir = join(cwd, skillsLocalDir);
    const agentsLocalDir = join(claudeLocalDir, "agents");
    const agentsDir = join(cwd, agentsLocalDir);
    const logger = new TerminalLogger();

    const agentsMdPath = join(cwd, "AGENTS.md");
    await Bun.write(agentsMdPath, agentsMd);
    logger.success("AGENTS.md created successfully", undefined, LOG_OPTIONS);

    for (const [agentName, content] of Object.entries(agents)) {
      await Bun.write(join(agentsDir, `${agentName}.md`), content);
      logger.success(`${join(agentsLocalDir, `${agentName}.md`)} created successfully`, undefined, LOG_OPTIONS);
    }

    for (const [skillName, template] of Object.entries(skills)) {
      const dirName = skillName.replace(/\./g, "-");
      const content = typeof template === "string" ? template : template.skill;
      const references = typeof template === "string" ? undefined : template.references;

      await Bun.write(join(skillsDir, dirName, "SKILL.md"), content);
      logger.success(`${join(skillsLocalDir, dirName, "SKILL.md")} created successfully`, undefined, LOG_OPTIONS);

      for (const [refName, refContent] of Object.entries(references ?? {})) {
        await Bun.write(join(skillsDir, dirName, "references", refName), refContent);
        logger.success(
          `${join(skillsLocalDir, dirName, "references", refName)} created successfully`,
          undefined,
          LOG_OPTIONS,
        );
      }
    }
  }
}
