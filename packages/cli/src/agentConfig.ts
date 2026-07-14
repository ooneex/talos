import { join } from "node:path";
import { TerminalLogger } from "@talosjs/logger";
import { agents } from "./templates/llm/agents";
import { resolveAdapter, type ScaffoldInput } from "./templates/llm/assistants";
import { agentsMd, skills } from "./templates/llm/skills";
import { LOG_OPTIONS } from "./utils";

// Normalise the skills template map (a value is either a bare `SKILL.md` string
// or a `{ skill, references }` object) into the shape every adapter consumes.
const toScaffoldInput = (): ScaffoldInput => ({
  agentsMd,
  agents,
  skills: Object.fromEntries(
    Object.entries(skills).map(([name, template]) => [
      name,
      typeof template === "string"
        ? { source: template }
        : template.references
          ? { source: template.skill, references: template.references }
          : { source: template.skill },
    ]),
  ),
});

/**
 * Scaffold the shared AGENTS.md, agent files and skills into an assistant config
 * directory (e.g. ".claude" or ".codex"). Each assistant gets its native layout
 * and file format via its adapter; assistants without a dedicated adapter fall
 * back to the Claude-style layout. All files are written concurrently since they
 * target independent paths.
 */
export const scaffoldAgentConfig = async (configDir: string, cwd = process.cwd()): Promise<void> => {
  const logger = new TerminalLogger();
  const files = resolveAdapter(configDir)(toScaffoldInput(), configDir);

  await Promise.all(
    files.map((file) =>
      Bun.write(join(cwd, file.path), file.content).then(() =>
        logger.success(`${file.path} created successfully`, undefined, LOG_OPTIONS),
      ),
    ),
  );
};
