import { join } from "node:path";
import { toCodexAgent, toCodexSkill } from "./codex";
import {
  canWriteFiles,
  mergeDescription,
  parseTemplate,
  tomlBasicString,
  toTitleCase,
  yamlBlockScalar,
  yamlDoubleQuoted,
} from "./frontmatter";

// Each coding assistant reads its agent/skill/rule configuration from a
// different set of paths and file formats. An adapter renders the shared
// templates into the native layout for one assistant; `scaffoldAgentConfig`
// picks the adapter by config directory and writes whatever files it returns.
//
// Sources for each native format:
//   • Gemini    https://geminicli.com/docs/cli/custom-commands/ (TOML commands)
//   • Cursor    https://cursor.com/docs — .cursor/commands (plain Markdown)
//   • Windsurf  https://docs.windsurf.com/windsurf/cascade/workflows
//   • Cline     https://docs.cline.bot/customization/cline-rules
//   • Junie     https://junie.jetbrains.com/docs/guidelines-and-memory.html
//   • Roo Code  https://docs.roocode.com/features/custom-modes + /slash-commands
//   • Continue  https://docs.continue.dev/customize/deep-dives/prompts
//   • Zed       https://zed.dev/docs/ai/skills (SKILL.md in .agents/skills)

export type GeneratedFile = {
  // Path relative to the project root; `scaffoldAgentConfig` prepends the cwd.
  path: string;
  content: string;
};

export type SkillInput = {
  source: string;
  references?: Record<string, string>;
};

export type ScaffoldInput = {
  agentsMd: string;
  agents: Record<string, string>;
  skills: Record<string, SkillInput>;
};

export type AssistantAdapter = (input: ScaffoldInput, configDir: string) => GeneratedFile[];

// Skill names use dots (e.g. `talos.packages`); most assistants want a
// filesystem-friendly hyphenated slug for the file/folder name.
const slugify = (name: string): string => name.replace(/\./g, "-");

// The body of a template with its Claude front matter stripped — what plain
// Markdown command/workflow formats want.
const body = (source: string): string => parseTemplate(source).body;

// A `---` front-matter block from `key: value` pairs (values already escaped).
const frontMatter = (fields: Record<string, string>): string =>
  ["---", ...Object.entries(fields).map(([key, value]) => `${key}: ${value}`), "---"].join("\n");

// Render a template as Markdown with a fresh front matter block prepended.
const markdownWithFrontMatter = (source: string, fields: Record<string, string>): string =>
  `${frontMatter(fields)}\n\n${body(source)}\n`;

// The shared root context file every assistant gets.
const agentsMdFile = (input: ScaffoldInput): GeneratedFile => ({ path: "AGENTS.md", content: input.agentsMd });

/**
 * Claude and any assistant without a dedicated adapter: AGENTS.md at the root,
 * agent Markdown files under `<dir>/agents`, and `SKILL.md` folders (plus their
 * reference docs) under `<dir>/skills`.
 */
export const defaultAdapter: AssistantAdapter = (input, configDir) => {
  const files: GeneratedFile[] = [agentsMdFile(input)];

  for (const [name, content] of Object.entries(input.agents)) {
    files.push({ path: join(configDir, "agents", `${name}.md`), content });
  }

  for (const [name, skill] of Object.entries(input.skills)) {
    const slug = slugify(name);
    files.push({ path: join(configDir, "skills", slug, "SKILL.md"), content: skill.source });

    for (const [refName, refContent] of Object.entries(skill.references ?? {})) {
      files.push({ path: join(configDir, "skills", slug, "references", refName), content: refContent });
    }
  }

  return files;
};

/**
 * Codex: TOML custom agents under `.codex/agents` and trimmed `SKILL.md` folders
 * under `.codex/skills`.
 */
export const codexAdapter: AssistantAdapter = (input) => {
  const files: GeneratedFile[] = [agentsMdFile(input)];

  for (const [name, content] of Object.entries(input.agents)) {
    files.push({ path: join(".codex", "agents", `${name}.toml`), content: toCodexAgent(content) });
  }

  for (const [name, skill] of Object.entries(input.skills)) {
    const slug = slugify(name);
    files.push({ path: join(".codex", "skills", slug, "SKILL.md"), content: toCodexSkill(skill.source) });

    for (const [refName, refContent] of Object.entries(skill.references ?? {})) {
      files.push({ path: join(".codex", "skills", slug, "references", refName), content: refContent });
    }
  }

  return files;
};

// Render a template as a Gemini TOML command: a one-line description plus the
// body as the `prompt` literal string.
const geminiCommand = (source: string): string => {
  const { data, body: prompt } = parseTemplate(source);

  return `description = ${tomlBasicString(mergeDescription(data))}\nprompt = '''\n${prompt}\n'''\n`;
};

/**
 * Gemini CLI: `GEMINI.md` context plus TOML commands. Dotted skill names become
 * namespaced commands via sub-directories (`talos.packages` → `/talos:packages`);
 * agents live under an `agents/` namespace (`/agents:<name>`).
 */
export const geminiAdapter: AssistantAdapter = (input) => {
  const files: GeneratedFile[] = [agentsMdFile(input), { path: "GEMINI.md", content: input.agentsMd }];

  for (const [name, skill] of Object.entries(input.skills)) {
    const commandPath = `${name.replace(/\./g, "/")}.toml`;
    files.push({ path: join(".gemini", "commands", commandPath), content: geminiCommand(skill.source) });
  }

  for (const [name, content] of Object.entries(input.agents)) {
    files.push({ path: join(".gemini", "commands", "agents", `${name}.toml`), content: geminiCommand(content) });
  }

  return files;
};

/**
 * Cursor: AGENTS.md context (Cursor reads it natively) plus plain-Markdown slash
 * commands under `.cursor/commands` — Cursor commands do not support front
 * matter, so only the body is written. Agents become commands too.
 */
export const cursorAdapter: AssistantAdapter = (input) => {
  const files: GeneratedFile[] = [agentsMdFile(input)];

  for (const [name, skill] of Object.entries(input.skills)) {
    files.push({ path: join(".cursor", "commands", `${slugify(name)}.md`), content: `${body(skill.source)}\n` });
  }

  for (const [name, content] of Object.entries(input.agents)) {
    files.push({ path: join(".cursor", "commands", `${name}.md`), content: `${body(content)}\n` });
  }

  return files;
};

/**
 * Windsurf: an always-on rule carrying the AGENTS.md guidance plus slash-command
 * workflows under `.windsurf/workflows`. Agents become workflows too.
 */
export const windsurfAdapter: AssistantAdapter = (input) => {
  const files: GeneratedFile[] = [
    agentsMdFile(input),
    {
      path: join(".windsurf", "rules", "talos.md"),
      content: `${frontMatter({ trigger: "always_on" })}\n\n${input.agentsMd}`,
    },
  ];

  const workflow = (name: string, source: string): GeneratedFile => {
    const { data } = parseTemplate(source);

    return {
      path: join(".windsurf", "workflows", `${name}.md`),
      content: markdownWithFrontMatter(source, { description: yamlDoubleQuoted(mergeDescription(data)) }),
    };
  };

  for (const [name, skill] of Object.entries(input.skills)) {
    files.push(workflow(slugify(name), skill.source));
  }

  for (const [name, content] of Object.entries(input.agents)) {
    files.push(workflow(name, content));
  }

  return files;
};

/**
 * Cline reads every Markdown file under `.clinerules/` as a rule and every file
 * under `.clinerules/workflows/` as an invokable workflow. Skills and agents
 * become workflows; the AGENTS.md guidance becomes a top-level rule.
 */
export const clineAdapter: AssistantAdapter = (input) => {
  const files: GeneratedFile[] = [
    agentsMdFile(input),
    { path: join(".clinerules", "00-talos.md"), content: input.agentsMd },
  ];

  for (const [name, skill] of Object.entries(input.skills)) {
    files.push({ path: join(".clinerules", "workflows", `${slugify(name)}.md`), content: `${body(skill.source)}\n` });
  }

  for (const [name, content] of Object.entries(input.agents)) {
    files.push({ path: join(".clinerules", "workflows", `${name}.md`), content: `${body(content)}\n` });
  }

  return files;
};

/**
 * Junie reads a single `.junie/guidelines.md`. It has no command/subagent file
 * format, so skills and agents are written as reference docs Junie can open on
 * demand.
 */
export const junieAdapter: AssistantAdapter = (input) => {
  const files: GeneratedFile[] = [
    agentsMdFile(input),
    { path: join(".junie", "guidelines.md"), content: input.agentsMd },
  ];

  for (const [name, skill] of Object.entries(input.skills)) {
    files.push({ path: join(".junie", "skills", `${slugify(name)}.md`), content: `${body(skill.source)}\n` });
  }

  for (const [name, content] of Object.entries(input.agents)) {
    files.push({ path: join(".junie", "agents", `${name}.md`), content: `${body(content)}\n` });
  }

  return files;
};

// Render all agents into a single `.roomodes` YAML document as custom modes.
const roomodes = (agents: Record<string, string>): string => {
  const lines = ["customModes:"];

  for (const [name, source] of Object.entries(agents)) {
    const { data, body: instructions } = parseTemplate(source);
    const groups = canWriteFiles(data) ? "[read, edit, command]" : "[read]";

    lines.push(`  - slug: ${name}`);
    lines.push(`    name: ${yamlDoubleQuoted(toTitleCase(name))}`);
    lines.push(`    roleDefinition: ${yamlDoubleQuoted(data.description ?? "")}`);

    if (data.when_to_use) {
      lines.push(`    whenToUse: ${yamlDoubleQuoted(data.when_to_use)}`);
    }

    lines.push(`    groups: ${groups}`);
    lines.push(`    customInstructions: ${yamlBlockScalar(instructions, 6)}`);
  }

  return `${lines.join("\n")}\n`;
};

/**
 * Roo Code: agents become custom modes in `.roomodes`, skills become slash
 * commands under `.roo/commands`, and the AGENTS.md guidance becomes a workspace
 * rule under `.roo/rules`.
 */
export const rooAdapter: AssistantAdapter = (input) => {
  const files: GeneratedFile[] = [
    agentsMdFile(input),
    { path: join(".roo", "rules", "00-talos.md"), content: input.agentsMd },
    { path: ".roomodes", content: roomodes(input.agents) },
  ];

  for (const [name, skill] of Object.entries(input.skills)) {
    files.push({ path: join(".roo", "commands", `${slugify(name)}.md`), content: `${body(skill.source)}\n` });
  }

  return files;
};

/**
 * Continue: an always-applied rule carrying the AGENTS.md guidance plus invokable
 * prompt files (slash commands) under `.continue/prompts`. Agents become
 * invokable prompts too.
 */
export const continueAdapter: AssistantAdapter = (input) => {
  const files: GeneratedFile[] = [
    agentsMdFile(input),
    {
      path: join(".continue", "rules", "00-talos.md"),
      content: `${frontMatter({ name: yamlDoubleQuoted("Talos"), alwaysApply: "true" })}\n\n${input.agentsMd}`,
    },
  ];

  const prompt = (name: string, source: string): GeneratedFile => {
    const { data } = parseTemplate(source);

    return {
      path: join(".continue", "prompts", `${name}.md`),
      content: markdownWithFrontMatter(source, {
        name: yamlDoubleQuoted(toTitleCase(name)),
        description: yamlDoubleQuoted(mergeDescription(data)),
        invokable: "true",
      }),
    };
  };

  for (const [name, skill] of Object.entries(input.skills)) {
    files.push(prompt(slugify(name), skill.source));
  }

  for (const [name, content] of Object.entries(input.agents)) {
    files.push(prompt(name, content));
  }

  return files;
};

/**
 * Zed: a `.rules` project file plus skills under `.agents/skills` following the
 * same `SKILL.md` standard as Codex. Agents are rendered as skills too.
 */
export const zedAdapter: AssistantAdapter = (input) => {
  const files: GeneratedFile[] = [agentsMdFile(input), { path: ".rules", content: input.agentsMd }];

  for (const [name, skill] of Object.entries(input.skills)) {
    const slug = slugify(name);
    files.push({ path: join(".agents", "skills", slug, "SKILL.md"), content: toCodexSkill(skill.source) });

    for (const [refName, refContent] of Object.entries(skill.references ?? {})) {
      files.push({ path: join(".agents", "skills", slug, "references", refName), content: refContent });
    }
  }

  for (const [name, content] of Object.entries(input.agents)) {
    files.push({ path: join(".agents", "skills", name, "SKILL.md"), content: toCodexSkill(content) });
  }

  return files;
};

const assistantAdapters: Record<string, AssistantAdapter> = {
  ".codex": codexAdapter,
  ".gemini": geminiAdapter,
  ".cursor": cursorAdapter,
  ".windsurf": windsurfAdapter,
  ".cline": clineAdapter,
  ".junie": junieAdapter,
  ".roo": rooAdapter,
  ".continue": continueAdapter,
  ".zed": zedAdapter,
};

// Resolve the adapter for a config directory, falling back to the Claude-style
// layout for `.claude` and any assistant without a dedicated adapter.
export const resolveAdapter = (configDir: string): AssistantAdapter => assistantAdapters[configDir] ?? defaultAdapter;
