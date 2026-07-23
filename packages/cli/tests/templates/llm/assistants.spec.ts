import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TOML, YAML } from "bun";
import { loadScaffoldInput, resetSkeletonDirCache } from "@/agentConfig";
import { type GeneratedFile, resolveAdapter, type ScaffoldInput } from "@/templates/llm/assistants";

// Real checkout of https://github.com/ooneex/skeleton.git, cloned once and cached
// on disk under the OS tmp dir. Each test's faked `git clone` copies this cache
// instead of hitting the network.
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

let originalSpawn: typeof Bun.spawn;

const render = async (configDir: string): Promise<GeneratedFile[]> => {
  const input = (await loadScaffoldInput(process.cwd(), { appName: "fixture-app", silent: true })) as ScaffoldInput;
  return resolveAdapter(configDir)(input, configDir);
};

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
  beforeEach(() => {
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
  });

  test("every adapter writes the shared AGENTS.md at the project root", async () => {
    const input = (await loadScaffoldInput(process.cwd(), { appName: "fixture-app", silent: true })) as ScaffoldInput;

    for (const dir of [".gemini", ".cursor", ".windsurf", ".cline", ".junie", ".roo", ".continue", ".zed"]) {
      expect(find(await render(dir), "AGENTS.md").content).toBe(input.agentsMd);
    }
  });

  test("resolveAdapter falls back to the Claude layout for unknown assistants", async () => {
    const files = await render(".unknown");

    expect(find(files, ".unknown/agents/module-issue-fixer.md").content).toContain("# Module Issue Fixer");
    expect(find(files, ".unknown/skills/commit/SKILL.md")).toBeDefined();
  });

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
  ])("generates only parseable native files for %s", async (dir) => {
    for (const file of await render(dir)) {
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
    test("writes GEMINI.md context and TOML commands", async () => {
      const files = await render(".gemini");
      expect(find(files, "GEMINI.md").content).toContain("fixture-app");
      const command = find(files, ".gemini/commands/talos-packages.toml");
      const parsed = TOML.parse(command.content) as { prompt: string; description: string };
      expect(parsed.prompt).toContain("#");
      expect(parsed.description.length).toBeGreaterThan(0);
    });

    test("exposes agents as namespaced commands", async () => {
      const parsed = TOML.parse(
        find(await render(".gemini"), ".gemini/commands/agents/module-issue-fixer.toml").content,
      );
      expect(parsed).toHaveProperty("prompt");
    });
  });

  describe("Cursor", () => {
    test("writes plain-Markdown commands without front matter", async () => {
      const files = await render(".cursor");
      const command = find(files, ".cursor/commands/commit.md");
      expect(command.content.startsWith("---")).toBe(false);
      expect(command.content).toContain("# Commit by Module");
      expect(find(files, ".cursor/commands/module-issue-fixer.md")).toBeDefined();
    });
  });

  describe("Windsurf", () => {
    test("writes an always-on rule and slash-command workflows", async () => {
      const files = await render(".windsurf");
      expect(frontMatter(find(files, ".windsurf/rules/talos.md").content)).toEqual({ trigger: "always_on" });
      expect(frontMatter(find(files, ".windsurf/workflows/commit.md").content)).toHaveProperty("description");
    });
  });

  describe("Cline", () => {
    test("writes a top-level rule and workflows under .clinerules", async () => {
      const files = await render(".cline");
      expect(find(files, ".clinerules/00-talos.md").content).toContain("fixture-app");
      expect(find(files, ".clinerules/workflows/commit.md").content).toContain("# Commit by Module");
      expect(find(files, ".clinerules/workflows/module-issue-fixer.md")).toBeDefined();
    });
  });

  describe("Junie", () => {
    test("writes guidelines plus skill and agent reference docs", async () => {
      const files = await render(".junie");
      expect(find(files, ".junie/guidelines.md").content).toContain("fixture-app");
      expect(find(files, ".junie/skills/commit.md")).toBeDefined();
      expect(find(files, ".junie/agents/module-issue-fixer.md")).toBeDefined();
    });
  });

  describe("Roo Code", () => {
    test("writes agents as custom modes in .roomodes", async () => {
      const files = await render(".roo");
      const parsed = YAML.parse(find(files, ".roomodes").content) as {
        customModes: { slug: string; groups: unknown }[];
      };
      expect(parsed.customModes).toHaveLength(15);
      const fixer = parsed.customModes.find((mode) => mode.slug === "module-issue-fixer");
      expect(fixer?.groups).toEqual(["read", "edit", "command"]);
      const founder = parsed.customModes.find((mode) => mode.slug === "module-issue-founder");
      expect(founder?.groups).toEqual(["read"]);
    });

    test("writes skills as slash commands and the guidance as a rule", async () => {
      const files = await render(".roo");
      expect(find(files, ".roo/rules/00-talos.md").content).toContain("fixture-app");
      expect(find(files, ".roo/commands/commit.md").content).toContain("# Commit by Module");
    });
  });

  describe("Continue", () => {
    test("writes an always-applied rule and invokable prompts", async () => {
      const files = await render(".continue");
      expect(frontMatter(find(files, ".continue/rules/00-talos.md").content)).toMatchObject({ alwaysApply: true });
      expect(frontMatter(find(files, ".continue/prompts/commit.md").content)).toMatchObject({ invokable: true });
    });
  });

  describe("Zed", () => {
    test("writes a .rules file and SKILL.md skills under .agents/skills", async () => {
      const files = await render(".zed");
      expect(find(files, ".rules").content).toContain("fixture-app");
      expect(frontMatter(find(files, ".agents/skills/commit/SKILL.md").content)).toHaveProperty("name", "commit");
    });

    test("renders agents as skills with YAML-safe descriptions", async () => {
      const parsed = frontMatter(find(await render(".zed"), ".agents/skills/api-issue-fixer/SKILL.md").content) as {
        description: string;
      };
      expect(parsed.description).toContain('type: "api"');
    });
  });
});
