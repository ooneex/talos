import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";

const { ClaudeInitCommand } = await import("@/commands/ClaudeInitCommand");

describe("ClaudeInitCommand", () => {
  let command: InstanceType<typeof ClaudeInitCommand>;
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    command = new ClaudeInitCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `claude-init-${Date.now()}`);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("claude:init");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Initialize Claude configuration and skills");
    });
  });

  describe("run()", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, ".claude", "skills", ".gitkeep"), "");
      process.chdir(testDir);
    });

    test("should generate skill files from templates", async () => {
      await command.run();

      const skillsDir = join(testDir, ".claude", "skills");
      const glob = new Glob("*/SKILL.md");
      const files: string[] = [];

      for await (const file of glob.scan(skillsDir)) {
        files.push(file);
      }

      expect(files.length).toBeGreaterThan(0);
    });

    test("should generate SKILL.md files inside skill directories", async () => {
      await command.run();

      const skillsDir = join(testDir, ".claude", "skills");
      const glob = new Glob("*/SKILL.md");

      for await (const file of glob.scan(skillsDir)) {
        expect(file.endsWith("SKILL.md")).toBe(true);
      }
    });

    test("should generate ai-chat-create skill", async () => {
      await command.run();

      const filePath = join(testDir, ".claude", "skills", "ai-chat-create", "SKILL.md");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("name: ai:chat:create");
    });

    test("should generate controller-create skill", async () => {
      await command.run();

      const filePath = join(testDir, ".claude", "skills", "controller-create", "SKILL.md");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("name: controller:create");
    });

    test("should generate service-create skill", async () => {
      await command.run();

      const filePath = join(testDir, ".claude", "skills", "service-create", "SKILL.md");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("name: service:create");
    });

    test("should generate flag-create skill", async () => {
      await command.run();

      const filePath = join(testDir, ".claude", "skills", "flag-create", "SKILL.md");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("name: flag:create");
    });

    test("should generate translation-create skill", async () => {
      await command.run();

      const filePath = join(testDir, ".claude", "skills", "translation-create", "SKILL.md");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("name: translation:create");
    });

    test("should generate command-create skill", async () => {
      await command.run();

      const filePath = join(testDir, ".claude", "skills", "command-create", "SKILL.md");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("name: command:create");
    });

    test("should generate commit skill", async () => {
      await command.run();

      const filePath = join(testDir, ".claude", "skills", "commit", "SKILL.md");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("name: commit");
    });

    test("should generate pr skill", async () => {
      await command.run();

      const filePath = join(testDir, ".claude", "skills", "pr", "SKILL.md");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("name: pr");
    });

    test("should generate optimize skill", async () => {
      await command.run();

      const filePath = join(testDir, ".claude", "skills", "optimize", "SKILL.md");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("name: optimize");
    });

    test("should generate talos-architecture skill", async () => {
      await command.run();

      const filePath = join(testDir, ".claude", "skills", "talos-architecture", "SKILL.md");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("name: talos:architecture");
    });

    test("should preserve frontmatter in generated files", async () => {
      await command.run();

      const skillsDir = join(testDir, ".claude", "skills");
      const glob = new Glob("*/SKILL.md");

      for await (const file of glob.scan(skillsDir)) {
        const content = await Bun.file(join(skillsDir, file)).text();
        expect(content).toStartWith("---\n");
        expect(content).toContain("name:");
        expect(content).toContain("description:");
      }
    });

    test("should generate AGENTS.md file", async () => {
      await command.run();

      const filePath = join(testDir, "AGENTS.md");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("# AGENTS.md");
    });

    test("should generate commit skill", async () => {
      await command.run();

      const filePath = join(testDir, ".claude", "skills", "commit", "SKILL.md");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("name: commit");
    });

    test("should generate issue-fix skill", async () => {
      await command.run();

      const filePath = join(testDir, ".claude", "skills", "issue-fix", "SKILL.md");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("name: issue:fix");
    });

    test("should generate issue-plan skill", async () => {
      await command.run();

      const filePath = join(testDir, ".claude", "skills", "issue-plan", "SKILL.md");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("name: issue:plan");
    });

    test("should generate issue-found skill", async () => {
      await command.run();

      const filePath = join(testDir, ".claude", "skills", "issue-found", "SKILL.md");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("name: issue:found");
    });

    test("should generate all 51 skill templates", async () => {
      await command.run();

      const skillsDir = join(testDir, ".claude", "skills");
      const glob = new Glob("*/SKILL.md");
      const files: string[] = [];

      for await (const file of glob.scan(skillsDir)) {
        files.push(file);
      }

      expect(files.length).toBe(51);
    });

    test("should generate agent files from templates", async () => {
      await command.run();

      const agentsDir = join(testDir, ".claude", "agents");
      const glob = new Glob("*.md");
      const files: string[] = [];

      for await (const file of glob.scan(agentsDir)) {
        files.push(file);
      }

      expect(files.length).toBeGreaterThan(0);
    });

    test("should generate design-issue-founder agent", async () => {
      await command.run();

      const filePath = join(testDir, ".claude", "agents", "design-issue-founder.md");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("name: design-issue-founder");
    });

    test("should generate module-issue-fixer agent", async () => {
      await command.run();

      const filePath = join(testDir, ".claude", "agents", "module-issue-fixer.md");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("name: module-issue-fixer");
    });

    test("should preserve frontmatter in generated agent files", async () => {
      await command.run();

      const agentsDir = join(testDir, ".claude", "agents");
      const glob = new Glob("*.md");

      for await (const file of glob.scan(agentsDir)) {
        const content = await Bun.file(join(agentsDir, file)).text();
        expect(content).toStartWith("---\n");
        expect(content).toContain("name:");
        expect(content).toContain("description:");
      }
    });

    test("should generate all 15 agent templates", async () => {
      await command.run();

      const agentsDir = join(testDir, ".claude", "agents");
      const glob = new Glob("*.md");
      const files: string[] = [];

      for await (const file of glob.scan(agentsDir)) {
        files.push(file);
      }

      expect(files.length).toBe(15);
    });
  });
});
