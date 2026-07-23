import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cpSync, existsSync, rmSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Glob } from "bun";

let selectedAgents: string[] = [".claude"];

mock.module("enquirer", () => ({
  prompt: mock((config: { type?: string }) => {
    if (config?.type === "multiselect") {
      return Promise.resolve({ agents: selectedAgents });
    }
    return Promise.resolve({ name: "Test" });
  }),
}));

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
const { resetSkeletonDirCache } = await import("@/agentConfig");

const skillFileCount = async (skillsDir: string) => {
  const glob = new Glob("*/SKILL.md");
  const files: string[] = [];

  for await (const file of glob.scan(skillsDir)) {
    files.push(file);
  }

  return files.length;
};

// Real checkout of https://github.com/ooneex/skeleton.git, cloned once and cached
// on disk under the OS tmp dir. Each test's faked `git clone` copies this cache
// instead of hitting the network. Must resolve before any test replaces
// `Bun.spawn` (this runs at module load, before `beforeEach`), so the real git
// clone runs instead of a test's faked `git` responses.
const skeletonSourceCacheDir = join(tmpdir(), "talos-cli-tests-skeleton-source");
const skeletonSourceReadyMarker = join(skeletonSourceCacheDir, ".ready");

const resolveTestSkeletonSource = async (): Promise<string> => {
  if (existsSync(skeletonSourceReadyMarker)) {
    return skeletonSourceCacheDir;
  }

  await rm(skeletonSourceCacheDir, { recursive: true, force: true });

  const proc = Bun.spawn(
    ["git", "clone", "--depth", "1", "https://github.com/ooneex/skeleton.git", skeletonSourceCacheDir],
    { stdout: "ignore", stderr: "pipe" },
  );
  const [exitCode, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);

  if (exitCode !== 0) {
    throw new Error(`Failed to clone skeleton repo for tests: ${stderr.trim()}`);
  }

  await Bun.write(skeletonSourceReadyMarker, "");
  return skeletonSourceCacheDir;
};

const skeletonFixture = await resolveTestSkeletonSource();

describe("AgentSkillsCreateCommand", () => {
  let command: InstanceType<typeof AgentSkillsCreateCommand>;
  let testDir: string;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    selectedAgents = [".claude"];
    command = new AgentSkillsCreateCommand();
    testDir = join(process.cwd(), ".temp", `agent-skills-${Date.now()}`);
    resetSkeletonDirCache();

    originalSpawn = Bun.spawn;
    Bun.spawn = ((...args: unknown[]) => {
      const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;
      if (Array.isArray(cmd) && cmd[0] === "git" && cmd[1] === "clone") {
        cpSync(skeletonFixture, cmd[cmd.length - 1] as string, { recursive: true });
        return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
      }
      return originalSpawn.apply(Bun, args as Parameters<typeof Bun.spawn>);
    }) as typeof Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
    resetSkeletonDirCache();
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
      await command.run({ cwd: testDir, agents: [".codex", ".cursor"], name: "my-app" });

      expect(await skillFileCount(join(testDir, ".codex", "skills"))).toBeGreaterThan(0);
      expect(existsSync(join(testDir, ".cursor", "commands", "commit.md"))).toBe(true);
      expect(existsSync(join(testDir, "AGENTS.md"))).toBe(true);
      expect(await Bun.file(join(testDir, "AGENTS.md")).text()).toContain("my-app");
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

    test("should copy skill references for assistants that preserve them", async () => {
      await command.run({ cwd: testDir, agents: [".claude", ".codex"] });

      expect(existsSync(join(testDir, ".claude", "skills", "optimize-ui", "references", "ai-slop.md"))).toBe(true);
      expect(existsSync(join(testDir, ".codex", "skills", "optimize-ui", "references", "color-contrast.md"))).toBe(
        true,
      );
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
