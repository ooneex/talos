// Shared helpers for turning the Claude-flavoured `.md.txt` agent/skill
// templates into the various formats every other assistant expects. The prose
// bodies are assistant-agnostic Talos guidance, so the templates are the single
// source of truth and each assistant adapter renders its own wrapper from them.

export type ParsedTemplate = {
  data: Record<string, string>;
  body: string;
};

/**
 * Split a `.md.txt` template into its `---`-delimited front matter and body. The
 * front matter is a flat `key: value` list (no nested YAML in these templates),
 * so a line-by-line parse is enough and keeps the CLI dependency-free. The body
 * is trimmed of surrounding blank lines.
 */
export const parseTemplate = (source: string): ParsedTemplate => {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?/);

  if (!match) {
    return { data: {}, body: source.trim() };
  }

  const data: Record<string, string> = {};

  for (const line of (match[1] ?? "").split("\n")) {
    const separator = line.indexOf(":");

    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();

    if (key) {
      data[key] = value;
    }
  }

  return { data, body: source.slice(match[0].length).replace(/^\n+/, "").replace(/\s+$/, "") };
};

// Codex/Cursor/etc. want the "when to use" guidance folded into the description,
// so merge the Claude `description` and `when_to_use` fields into one sentence.
export const mergeDescription = (data: Record<string, string>): string =>
  [data.description, data.when_to_use].filter(Boolean).join(" ");

// Whether an agent's Claude tool set lets it modify files. Used to pick sandbox
// modes / editable tool groups for assistants that distinguish read from write.
export const canWriteFiles = (data: Record<string, string>): boolean => /\b(Write|Edit)\b/.test(data.tools ?? "");

// Turn a hyphenated template name into a Title Case display name, e.g.
// `api-issue-fixer` → `Api Issue Fixer`.
export const toTitleCase = (name: string): string =>
  name
    .split(/[-.]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

// Escape a value for a TOML basic (double-quoted) string.
export const tomlBasicString = (value: string): string => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

// Escape a value for a YAML double-quoted scalar (used for the front matter this
// module writes, so descriptions containing colons/quotes stay parseable).
export const yamlDoubleQuoted = (value: string): string => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/**
 * Render a value as a YAML scalar, double-quoting it only when a plain scalar
 * would be misparsed — a `: ` or ` #` sequence, or a leading indicator char.
 * This keeps the common case unquoted (matching the hand-written templates) while
 * staying valid for descriptions that embed things like `type: "api"`.
 */
export const yamlScalar = (value: string): string => {
  const needsQuoting = /:\s|\s#|^[\s!"#%&*,>?@[\]{|}'`-]/.test(value) || /\s$/.test(value);

  return needsQuoting ? yamlDoubleQuoted(value) : value;
};

/**
 * Render a multi-line string as a YAML literal block scalar (`|-`) whose lines
 * are indented by `indent` spaces. Blank lines are emitted empty so the block
 * stays valid regardless of the body's content.
 */
export const yamlBlockScalar = (body: string, indent: number): string => {
  const pad = " ".repeat(indent);
  const lines = body.split("\n").map((line) => (line.length > 0 ? pad + line : ""));

  return `|-\n${lines.join("\n")}`;
};
