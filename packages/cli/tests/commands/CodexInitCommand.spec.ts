import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";

const { CodexInitCommand } = await import("@/commands/CodexInitCommand");

describe("CodexInitCommand", () => {
  let command: InstanceType<typeof CodexInitCommand>;
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    command = new CodexInitCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `codex-init-${Date.now()}`);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("codex:init");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Initialize Codex configuration and skills");
    });
  });

  describe("run()", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, ".codex", "skills", ".gitkeep"), "");
      process.chdir(testDir);
    });

    test("should generate skill files from templates", async () => {
      await command.run();

      const skillsDir = join(testDir, ".codex", "skills");
      const glob = new Glob("*/SKILL.md");
      const files: string[] = [];

      for await (const file of glob.scan(skillsDir)) {
        files.push(file);
      }

      expect(files.length).toBeGreaterThan(0);
    });

    test("should generate SKILL.md files inside skill directories", async () => {
      await command.run();

      const skillsDir = join(testDir, ".codex", "skills");
      const glob = new Glob("*/SKILL.md");

      for await (const file of glob.scan(skillsDir)) {
        expect(file.endsWith("SKILL.md")).toBe(true);
      }
    });

    test("should generate ai-chat-create skill", async () => {
      await command.run();

      const filePath = join(testDir, ".codex", "skills", "ai-chat-create", "SKILL.md");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("name: ai:chat:create");
    });

    test("should generate service-create skill", async () => {
      await command.run();

      const filePath = join(testDir, ".codex", "skills", "service-create", "SKILL.md");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("name: service:create");
    });

    test("should generate translation-create skill", async () => {
      await command.run();

      const filePath = join(testDir, ".codex", "skills", "translation-create", "SKILL.md");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("name: translation:create");
    });

    test("should generate commit skill", async () => {
      await command.run();

      const filePath = join(testDir, ".codex", "skills", "commit", "SKILL.md");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("name: commit");
    });

    test("should generate optimize skill", async () => {
      await command.run();

      const filePath = join(testDir, ".codex", "skills", "optimize", "SKILL.md");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("name: optimize");
    });

    test("should generate talos-architecture skill", async () => {
      await command.run();

      const filePath = join(testDir, ".codex", "skills", "talos-architecture", "SKILL.md");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("name: talos:architecture");
    });

    test("should preserve frontmatter in generated files", async () => {
      await command.run();

      const skillsDir = join(testDir, ".codex", "skills");
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

    test("should generate all 51 skill templates", async () => {
      await command.run();

      const skillsDir = join(testDir, ".codex", "skills");
      const glob = new Glob("*/SKILL.md");
      const files: string[] = [];

      for await (const file of glob.scan(skillsDir)) {
        files.push(file);
      }

      expect(files.length).toBe(51);
    });

    test("should generate agent files from templates", async () => {
      await command.run();

      const agentsDir = join(testDir, ".codex", "agents");
      const glob = new Glob("*.md");
      const files: string[] = [];

      for await (const file of glob.scan(agentsDir)) {
        files.push(file);
      }

      expect(files.length).toBeGreaterThan(0);
    });

    test("should generate design-issue-founder agent", async () => {
      await command.run();

      const filePath = join(testDir, ".codex", "agents", "design-issue-founder.md");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("name: design-issue-founder");
    });

    test("should generate module-issue-fixer agent", async () => {
      await command.run();

      const filePath = join(testDir, ".codex", "agents", "module-issue-fixer.md");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("name: module-issue-fixer");
    });

    test("should preserve frontmatter in generated agent files", async () => {
      await command.run();

      const agentsDir = join(testDir, ".codex", "agents");
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

      const agentsDir = join(testDir, ".codex", "agents");
      const glob = new Glob("*.md");
      const files: string[] = [];

      for await (const file of glob.scan(agentsDir)) {
        files.push(file);
      }

      expect(files.length).toBe(15);
    });
  });
});
