// Adapters that turn the shared, Claude-flavoured agent/skill templates into the
// formats Codex expects:
//
//   • Codex agents  → TOML files whose body becomes the `developer_instructions`
//     string. See https://developers.openai.com/codex/subagents
//   • Codex skills  → `SKILL.md` files whose front matter is trimmed to the two
//     fields Codex reads (`name`, `description`). See
//     https://developers.openai.com/codex/skills
//
// Zed reuses `toCodexSkill` too — its skills follow the same `SKILL.md` standard.

import {
  canWriteFiles,
  mergeDescription,
  parseTemplate,
  tomlBasicString,
  toTitleCase,
  yamlScalar,
} from "./frontmatter";

/**
 * Render a shared agent template as a Codex custom-agent TOML file. The Claude
 * front matter maps onto Codex's schema: `effort` → `model_reasoning_effort`,
 * the read/write tool set → `sandbox_mode`, and the markdown body → the
 * `developer_instructions` literal string. `model` is intentionally omitted so
 * spawned agents inherit the parent session's model rather than pinning a
 * provider-specific id.
 */
export const toCodexAgent = (source: string): string => {
  const { data, body } = parseTemplate(source);
  const lines = [
    `name = ${tomlBasicString(data.name ?? "")}`,
    `description = ${tomlBasicString(mergeDescription(data))}`,
  ];

  if (data.effort) {
    lines.push(`model_reasoning_effort = ${tomlBasicString(data.effort)}`);
  }

  lines.push(`sandbox_mode = ${tomlBasicString(canWriteFiles(data) ? "workspace-write" : "read-only")}`);
  lines.push(`nickname_candidates = [${tomlBasicString(toTitleCase(data.name ?? ""))}]`);
  // A TOML multi-line literal string (''' … ''') keeps the body verbatim — no
  // escaping of the backslashes in the embedded regexes/paths — and the leading
  // newline after the opening delimiter is trimmed by TOML.
  lines.push("developer_instructions = '''");
  lines.push(body);
  lines.push("'''");

  return `${lines.join("\n")}\n`;
};

/**
 * Render a shared skill template as a Codex `SKILL.md`. Codex only reads `name`
 * and `description` from the front matter (the "when to use" guidance is folded
 * into the description), so the Claude-only fields — `model`, `effort`, `agent`,
 * `context`, `allowed-tools`, `user-invocable` — are dropped. The body is
 * preserved as-is.
 */
export const toCodexSkill = (source: string): string => {
  const { data, body } = parseTemplate(source);
  const frontMatter = [
    "---",
    `name: ${data.name ?? ""}`,
    `description: ${yamlScalar(mergeDescription(data))}`,
    "---",
  ].join("\n");

  return `${frontMatter}\n\n${body}\n`;
};
