import { describe, expect, test } from "bun:test";
import { TOML } from "bun";
import { toCodexAgent, toCodexSkill } from "@/templates/llm/codex";

const AGENT_TEMPLATE = [
  "---",
  "name: module-issue-fixer",
  'description: Implements a `type: "module"` issue.',
  "when_to_use: Use proactively whenever a backend module issue needs implementing.",
  "tools: Read, Edit, Write, Bash, Grep, Glob, Skill",
  "model: sonnet",
  "effort: medium",
  "memory: project",
  "color: green",
  "---",
  "",
  "# Module Issue Fixer",
  "",
  "You implement the issue. Match paths like `modules/<module>/` and `\\d+`.",
  "",
].join("\n");

const READONLY_AGENT_TEMPLATE = [
  "---",
  "name: module-issue-founder",
  "description: Audits a module's source.",
  "when_to_use: Use proactively whenever a module needs review.",
  "tools: Read, Grep, Glob",
  "model: opus",
  "effort: high",
  "---",
  "",
  "# Module Issue Founder",
  "",
  "You only find and report.",
].join("\n");

const SKILL_TEMPLATE = [
  "---",
  "name: commit",
  "description: Create commit messages grouped by module.",
  'when_to_use: Use when the user wants to commit changes. Triggers on "commit".',
  "model: haiku",
  "effort: low",
  "agent: general-purpose",
  "context: fork",
  "allowed-tools: Bash(gh:*)",
  "---",
  "",
  "# Commit by Module",
  "",
  "Create separate commits per modified module.",
].join("\n");

describe("toCodexAgent", () => {
  test("should render a parseable Codex agent TOML file", () => {
    const parsed = TOML.parse(toCodexAgent(AGENT_TEMPLATE)) as Record<string, unknown>;

    expect(parsed.name).toBe("module-issue-fixer");
    expect(parsed.nickname_candidates).toEqual(["Module Issue Fixer"]);
    expect(parsed.model_reasoning_effort).toBe("medium");
    expect(String(parsed.developer_instructions).trim()).toStartWith("# Module Issue Fixer");
  });

  test("should fold when_to_use into the description", () => {
    const parsed = TOML.parse(toCodexAgent(AGENT_TEMPLATE)) as Record<string, string>;

    expect(parsed.description).toContain("Implements a");
    expect(parsed.description).toContain("Use proactively whenever a backend module issue needs implementing.");
  });

  test("should map write-capable tool sets to a workspace-write sandbox", () => {
    const parsed = TOML.parse(toCodexAgent(AGENT_TEMPLATE)) as Record<string, string>;

    expect(parsed.sandbox_mode).toBe("workspace-write");
  });

  test("should map read-only tool sets to a read-only sandbox", () => {
    const parsed = TOML.parse(toCodexAgent(READONLY_AGENT_TEMPLATE)) as Record<string, string>;

    expect(parsed.sandbox_mode).toBe("read-only");
  });

  test("should not pin a model so spawned agents inherit the parent session", () => {
    const parsed = TOML.parse(toCodexAgent(AGENT_TEMPLATE)) as Record<string, unknown>;

    expect(parsed.model).toBeUndefined();
  });

  test("should preserve backslashes in the developer instructions", () => {
    const parsed = TOML.parse(toCodexAgent(AGENT_TEMPLATE)) as Record<string, string>;

    expect(parsed.developer_instructions).toContain("`\\d+`");
  });
});

describe("toCodexSkill", () => {
  test("should keep only the name and description front matter", () => {
    const result = toCodexSkill(SKILL_TEMPLATE);

    expect(result).toContain("name: commit");
    expect(result).toContain("description: Create commit messages grouped by module.");
    expect(result).not.toContain("allowed-tools:");
    expect(result).not.toContain("model:");
    expect(result).not.toContain("context:");
  });

  test("should fold when_to_use into the description", () => {
    const result = toCodexSkill(SKILL_TEMPLATE);

    expect(result).toContain("Create commit messages grouped by module. Use when the user wants to commit changes.");
  });

  test("should preserve the skill body", () => {
    const result = toCodexSkill(SKILL_TEMPLATE);

    expect(result).toContain("# Commit by Module");
    expect(result).toContain("Create separate commits per modified module.");
  });
});
