import { join } from "node:path";
import { TerminalLogger } from "@talosjs/logger";
import { agents } from "./templates/llm/agents";
import { agentsMd, skills } from "./templates/llm/skills";
import { LOG_OPTIONS } from "./utils";

/**
 * Scaffold the shared AGENTS.md, agent files and skills into an assistant config
 * directory (e.g. ".claude" or ".codex"). All files are written concurrently
 * since they target independent paths.
 */
export const scaffoldAgentConfig = async (configDir: string, cwd = process.cwd()): Promise<void> => {
  const logger = new TerminalLogger();
  const skillsLocalDir = join(configDir, "skills");
  const skillsDir = join(cwd, skillsLocalDir);
  const agentsLocalDir = join(configDir, "agents");
  const agentsDir = join(cwd, agentsLocalDir);

  const writes: Promise<unknown>[] = [];
  const write = (path: string, content: string, logPath: string): void => {
    writes.push(
      Bun.write(path, content).then(() => logger.success(`${logPath} created successfully`, undefined, LOG_OPTIONS)),
    );
  };

  write(join(cwd, "AGENTS.md"), agentsMd, "AGENTS.md");

  for (const [agentName, content] of Object.entries(agents)) {
    write(join(agentsDir, `${agentName}.md`), content, join(agentsLocalDir, `${agentName}.md`));
  }

  for (const [skillName, template] of Object.entries(skills)) {
    const dirName = skillName.replace(/\./g, "-");
    const content = typeof template === "string" ? template : template.skill;
    const references = typeof template === "string" ? undefined : template.references;

    write(join(skillsDir, dirName, "SKILL.md"), content, join(skillsLocalDir, dirName, "SKILL.md"));

    for (const [refName, refContent] of Object.entries(references ?? {})) {
      write(
        join(skillsDir, dirName, "references", refName),
        refContent,
        join(skillsLocalDir, dirName, "references", refName),
      );
    }
  }

  await Promise.all(writes);
};
