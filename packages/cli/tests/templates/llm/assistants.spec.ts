import { describe, expect, test } from "bun:test";
import { TOML, YAML } from "bun";
import { agents } from "@/templates/llm/agents";
import { type GeneratedFile, resolveAdapter, type ScaffoldInput } from "@/templates/llm/assistants";
import { agentsMd, skills } from "@/templates/llm/skills";

const input: ScaffoldInput = {
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
};

const render = (configDir: string): GeneratedFile[] => resolveAdapter(configDir)(input, configDir);

const find = (files: GeneratedFile[], path: string): GeneratedFile => {
  const file = files.find((candidate) => candidate.path === path);

  if (!file) {
    throw new Error(`expected generated file ${path}, got: ${files.map((f) => f.path).join(", ")}`);
  }

  return file;
};

const frontMatter = (content: string): unknown => {
  const match = content.match(/^---\n([\s\S]*?)\n---/);

  return match ? YAML.parse(match[1] ?? "") : undefined;
};

describe("assistant adapters", () => {
  test("every adapter writes the shared AGENTS.md at the project root", () => {
    for (const dir of [".gemini", ".cursor", ".windsurf", ".cline", ".junie", ".roo", ".continue", ".zed"]) {
      expect(find(render(dir), "AGENTS.md").content).toBe(agentsMd);
    }
  });

  test("resolveAdapter falls back to the Claude layout for unknown assistants", () => {
    const files = render(".unknown");

    expect(find(files, ".unknown/agents/module-issue-fixer.md").content).toBe(agents["module-issue-fixer"] ?? "");
    expect(find(files, ".unknown/skills/commit/SKILL.md")).toBeDefined();
  });

  // Every file the generated adapters emit must be machine-parseable in its
  // native format — TOML for `.toml`, YAML for `.roomodes` and any Markdown
  // front matter block. (`.claude`/fallback pass the hand-written templates
  // through verbatim, which use a lenient front-matter parser, so they are
  // excluded here.)
  test.each([
    ".codex",
    ".gemini",
    ".cursor",
    ".windsurf",
    ".cline",
    ".junie",
    ".roo",
    ".continue",
    ".zed",
  ])("generates only parseable native files for %s", (dir) => {
    for (const file of render(dir)) {
      if (file.path.endsWith(".toml")) {
        expect(() => TOML.parse(file.content)).not.toThrow();
      } else if (file.path === ".roomodes") {
        expect(() => YAML.parse(file.content)).not.toThrow();
      } else if (file.path.endsWith(".md") || file.path === ".rules") {
        const block = file.content.match(/^---\n([\s\S]*?)\n---/);

        if (block) {
          expect(() => YAML.parse(block[1] ?? "")).not.toThrow();
        }
      }
    }
  });

  describe("Gemini", () => {
    const files = render(".gemini");

    test("writes GEMINI.md context and namespaced TOML commands", () => {
      expect(find(files, "GEMINI.md").content).toBe(agentsMd);
      const command = find(files, ".gemini/commands/talos/packages.toml");
      const parsed = TOML.parse(command.content) as { prompt: string; description: string };
      expect(parsed.prompt).toContain("#");
      expect(parsed.description.length).toBeGreaterThan(0);
    });

    test("exposes agents as namespaced commands", () => {
      const parsed = TOML.parse(find(files, ".gemini/commands/agents/module-issue-fixer.toml").content);
      expect(parsed).toHaveProperty("prompt");
    });
  });

  describe("Cursor", () => {
    const files = render(".cursor");

    test("writes plain-Markdown commands without front matter", () => {
      const command = find(files, ".cursor/commands/commit.md");
      expect(command.content.startsWith("---")).toBe(false);
      expect(command.content).toContain("# Commit by Module");
      expect(find(files, ".cursor/commands/module-issue-fixer.md")).toBeDefined();
    });
  });

  describe("Windsurf", () => {
    const files = render(".windsurf");

    test("writes an always-on rule and slash-command workflows", () => {
      expect(frontMatter(find(files, ".windsurf/rules/talos.md").content)).toEqual({ trigger: "always_on" });
      expect(frontMatter(find(files, ".windsurf/workflows/commit.md").content)).toHaveProperty("description");
    });
  });

  describe("Cline", () => {
    const files = render(".cline");

    test("writes a top-level rule and workflows under .clinerules", () => {
      expect(find(files, ".clinerules/00-talos.md").content).toBe(agentsMd);
      expect(find(files, ".clinerules/workflows/commit.md").content).toContain("# Commit by Module");
      expect(find(files, ".clinerules/workflows/module-issue-fixer.md")).toBeDefined();
    });
  });

  describe("Junie", () => {
    const files = render(".junie");

    test("writes guidelines plus skill and agent reference docs", () => {
      expect(find(files, ".junie/guidelines.md").content).toBe(agentsMd);
      expect(find(files, ".junie/skills/commit.md")).toBeDefined();
      expect(find(files, ".junie/agents/module-issue-fixer.md")).toBeDefined();
    });
  });

  describe("Roo Code", () => {
    const files = render(".roo");

    test("writes agents as custom modes in .roomodes", () => {
      const parsed = YAML.parse(find(files, ".roomodes").content) as {
        customModes: { slug: string; groups: unknown }[];
      };
      expect(parsed.customModes).toHaveLength(Object.keys(agents).length);
      const fixer = parsed.customModes.find((mode) => mode.slug === "module-issue-fixer");
      expect(fixer?.groups).toEqual(["read", "edit", "command"]);
      const founder = parsed.customModes.find((mode) => mode.slug === "module-issue-founder");
      expect(founder?.groups).toEqual(["read"]);
    });

    test("writes skills as slash commands and the guidance as a rule", () => {
      expect(find(files, ".roo/rules/00-talos.md").content).toBe(agentsMd);
      expect(find(files, ".roo/commands/commit.md").content).toContain("# Commit by Module");
    });
  });

  describe("Continue", () => {
    const files = render(".continue");

    test("writes an always-applied rule and invokable prompts", () => {
      expect(frontMatter(find(files, ".continue/rules/00-talos.md").content)).toMatchObject({ alwaysApply: true });
      expect(frontMatter(find(files, ".continue/prompts/commit.md").content)).toMatchObject({ invokable: true });
    });
  });

  describe("Zed", () => {
    const files = render(".zed");

    test("writes a .rules file and SKILL.md skills under .agents/skills", () => {
      expect(find(files, ".rules").content).toBe(agentsMd);
      expect(frontMatter(find(files, ".agents/skills/commit/SKILL.md").content)).toHaveProperty("name", "commit");
    });

    test("renders agents as skills with YAML-safe descriptions", () => {
      // `api-issue-fixer`'s description embeds `type: "api"`, which must be quoted.
      const parsed = frontMatter(find(files, ".agents/skills/api-issue-fixer/SKILL.md").content) as {
        description: string;
      };
      expect(parsed.description).toContain('type: "api"');
    });
  });
});
