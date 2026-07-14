import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";

let selectedAgents: string[] = [".claude"];

// Mock enquirer so the multiselect prompt resolves deterministically.
mock.module("enquirer", () => ({
  prompt: mock((config: { type?: string }) => {
    if (config?.type === "multiselect") {
      return Promise.resolve({ agents: selectedAgents });
    }
    return Promise.resolve({ name: "Test" });
  }),
}));

// Mock logger to suppress output.
mock.module("@talosjs/logger", () => ({
  TerminalLogger: class {
    init() {}
    info() {}
    error() {}
    warn() {}
    debug() {}
    log() {}
    success() {}
  },
  decorator: {
    logger: () => () => {},
  },
}));

const { AgentSkillsCreateCommand } = await import("@/commands/AgentSkillsCreateCommand");

const skillFileCount = async (skillsDir: string) => {
  const glob = new Glob("*/SKILL.md");
  const files: string[] = [];

  for await (const file of glob.scan(skillsDir)) {
    files.push(file);
  }

  return files.length;
};

describe("AgentSkillsCreateCommand", () => {
  let command: InstanceType<typeof AgentSkillsCreateCommand>;
  let testDir: string;

  beforeEach(() => {
    selectedAgents = [".claude"];
    command = new AgentSkillsCreateCommand();
    testDir = join(process.cwd(), ".temp", `agent-skills-${Date.now()}`);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("agent:skills:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Scaffold skills and configuration for coding assistants");
    });
  });

  describe("run()", () => {
    test("should scaffold native skills and AGENTS.md for the provided assistants", async () => {
      await command.run({ cwd: testDir, agents: [".codex", ".cursor"] });

      expect(await skillFileCount(join(testDir, ".codex", "skills"))).toBeGreaterThan(0);
      expect(existsSync(join(testDir, ".cursor", "commands", "commit.md"))).toBe(true);
      expect(existsSync(join(testDir, "AGENTS.md"))).toBe(true);
    });

    test("should generate Codex agent files as TOML for the .codex assistant", async () => {
      await command.run({ cwd: testDir, agents: [".codex"] });

      const agentsDir = join(testDir, ".codex", "agents");
      const glob = new Glob("*.toml");
      const files: string[] = [];

      for await (const file of glob.scan(agentsDir)) {
        files.push(file);
      }

      expect(files.length).toBeGreaterThan(0);

      const agent = await Bun.file(join(agentsDir, "module-issue-fixer.toml")).text();
      expect(agent).toContain('name = "module-issue-fixer"');
      expect(agent).toContain("developer_instructions = '''");
    });

    test("should generate Markdown agent files for non-Codex assistants", async () => {
      await command.run({ cwd: testDir, agents: [".claude"] });

      const agentsDir = join(testDir, ".claude", "agents");
      const glob = new Glob("*.md");
      const files: string[] = [];

      for await (const file of glob.scan(agentsDir)) {
        files.push(file);
      }

      expect(files.length).toBeGreaterThan(0);
    });

    test("should prompt for assistants when none are provided", async () => {
      selectedAgents = [".windsurf"];
      await command.run({ cwd: testDir });

      expect(existsSync(join(testDir, ".windsurf", "workflows", "commit.md"))).toBe(true);
    });

    test("should scaffold nothing when the selection is empty", async () => {
      await command.run({ cwd: testDir, agents: [] });

      expect(existsSync(join(testDir, ".claude", "skills"))).toBe(false);
      expect(existsSync(join(testDir, "AGENTS.md"))).toBe(false);
    });
  });
});
