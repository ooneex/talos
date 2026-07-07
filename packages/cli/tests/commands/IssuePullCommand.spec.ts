import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const mockPrompt = mock(({ name }: { name: string }) => {
  if (name === "id") return Promise.resolve({ id: "ENG-123" });
  return Promise.resolve({});
});

mock.module("enquirer", () => ({
  prompt: mockPrompt,
}));

const mockIssue = {
  identifier: "ENG-123",
  title: "Test Issue",
  description: "Test description",
  state: { name: "In Progress" },
  priority: 2,
  team: { name: "Engineering" },
  assignee: { name: "Alice" },
  labels: [{ name: "bug" }, { name: "backend" }],
  comments: [{ body: "First comment", user: { name: "Alice" } }],
};

const mockGetIssue = mock(async (_id: string) => mockIssue);

mock.module("@talosjs/linear", () => ({
  LinearService: class {
    getIssue = mockGetIssue;
  },
  Issue: class {},
}));

let linearCredentials: Record<string, string> | null;

mock.module("@/credentials", () => ({
  readCredentials: mock(async (fileName: string) => (fileName === "linear.yml" ? linearCredentials : null)),
}));

const { IssuePullCommand } = await import("@/commands/IssuePullCommand");

describe("IssuePullCommand", () => {
  let command: InstanceType<typeof IssuePullCommand>;
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    command = new IssuePullCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `issue-pull-${Date.now()}`);
    linearCredentials = { token: "test-api-key" };
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("issue:pull");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Pull an issue from Linear and save it as a YAML file");
    });
  });

  describe("run()", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "issues", ".gitkeep"), "");
      process.chdir(testDir);
      mockPrompt.mockClear();
    });

    test("should create YAML file at issues/<identifier>.yml", async () => {
      await command.run({ id: "ENG-123" });

      expect(existsSync(join(testDir, "modules", "shared", "issues", "ENG-123.yml"))).toBe(true);
    });

    test("should write scalar fields to YAML", async () => {
      await command.run({ id: "ENG-123" });

      const content = await Bun.file(join(testDir, "modules", "shared", "issues", "ENG-123.yml")).text();

      expect(content).toContain('id: "ENG-123"');
      expect(content).toContain('module: "shared"');
      expect(content).toContain('title: "Test Issue"');
      expect(content).toContain("context: |");
      expect(content).toContain("  Test description");
    });

    test("should write state, priority, and labels to YAML", async () => {
      await command.run({ id: "ENG-123" });

      const content = await Bun.file(join(testDir, "modules", "shared", "issues", "ENG-123.yml")).text();

      expect(content).toContain('state: "In Progress"');
      expect(content).toContain('priority: "High"');
      expect(content).toContain("labels:");
      expect(content).toContain('  - "bug"');
      expect(content).toContain('  - "backend"');
    });

    test("should parse a pushed description into module, context, goal, dod and dependencies", async () => {
      mockGetIssue.mockImplementationOnce(async (_id: string) => ({
        ...mockIssue,
        description: [
          "**Module:** `billing`",
          "",
          "## Context",
          "",
          "Some context.",
          "",
          "## Goal",
          "",
          "Do the thing.",
          "",
          "## Technical Notes",
          "",
          "A nested heading stays in goal.",
          "",
          "## Definition of Done",
          "",
          "- [ ] First",
          "- [ ] Second",
          "",
          "## Dependencies",
          "",
          "- ENG-100",
          "- ENG-101",
        ].join("\n"),
      }));

      await command.run({ id: "ENG-123" });

      const content = await Bun.file(join(testDir, "modules", "shared", "issues", "ENG-123.yml")).text();

      expect(content).toContain('module: "billing"');
      expect(content).toContain("context: |\n  Some context.");
      expect(content).toContain(
        "goal: |\n  Do the thing.\n\n  ## Technical Notes\n\n  A nested heading stays in goal.",
      );
      expect(content).toContain("dod: |\n  - [ ] First\n  - [ ] Second");
      expect(content).toContain('dependencies:\n  - "ENG-100"\n  - "ENG-101"');
      expect(content).not.toContain("description:");
    });

    test("should fall back to the module option when the description has no module line", async () => {
      mockGetIssue.mockImplementationOnce(async (_id: string) => ({
        ...mockIssue,
        description: "## Goal\n\nJust a goal.",
      }));

      await command.run({ id: "ENG-123", module: "shared" });

      const content = await Bun.file(join(testDir, "modules", "shared", "issues", "ENG-123.yml")).text();

      expect(content).toContain('module: "shared"');
      expect(content).toContain("goal: |\n  Just a goal.");
    });

    test("should not write removed fields to YAML", async () => {
      await command.run({ id: "ENG-123" });

      const content = await Bun.file(join(testDir, "modules", "shared", "issues", "ENG-123.yml")).text();

      expect(content).not.toContain("url:");
      expect(content).not.toContain("createdAt:");
      expect(content).not.toContain("updatedAt:");
      expect(content).not.toContain("team:");
      expect(content).not.toContain("assignee:");
      expect(content).not.toContain("project:");
    });

    test("should write comments with author and message to YAML", async () => {
      await command.run({ id: "ENG-123" });

      const content = await Bun.file(join(testDir, "modules", "shared", "issues", "ENG-123.yml")).text();

      expect(content).toContain("comments:");
      expect(content).toContain('  - author: "Alice"');
      expect(content).toContain('    message: "First comment"');
    });

    test("should write null author when comment has no user", async () => {
      mockGetIssue.mockImplementationOnce(async (_id: string) => ({
        ...mockIssue,
        comments: [{ body: "Anonymous comment", user: null as unknown as { name: string } }],
      }));

      await command.run({ id: "ENG-123" });

      const content = await Bun.file(join(testDir, "modules", "shared", "issues", "ENG-123.yml")).text();

      expect(content).toContain("  - author: null");
      expect(content).toContain('    message: "Anonymous comment"');
    });

    test("should place file under module/issues/ when module is provided", async () => {
      await Bun.write(join(testDir, "modules", "my-module", "issues", ".gitkeep"), "");

      await command.run({ id: "ENG-123", module: "my-module" });

      expect(existsSync(join(testDir, "modules", "my-module", "issues", "ENG-123.yml"))).toBe(true);
    });

    test.each([["  "], [""]])("should fall back to the shared module when module is %p", async (module) => {
      await command.run({ id: "ENG-123", module });

      const content = await Bun.file(join(testDir, "modules", "shared", "issues", "ENG-123.yml")).text();
      expect(content).toContain('module: "shared"');
    });

    test("should not create file when Linear credentials are missing", async () => {
      linearCredentials = null;

      await command.run({ id: "ENG-123" });

      expect(existsSync(join(testDir, "modules", "shared", "issues", "ENG-123.yml"))).toBe(false);
    });

    test("should prompt for id when not provided", async () => {
      await command.run({});

      expect(mockPrompt).toHaveBeenCalledTimes(1);
      const calls = mockPrompt.mock.calls as unknown as Array<[{ name: string; initial?: string }]>;
      const idCall = calls.find((c) => c[0]?.name === "id");
      expect(idCall?.[0]?.initial).toMatch(/^[A-F]{3}-\d{6}$/);
      expect(existsSync(join(testDir, "modules", "shared", "issues", "ENG-123.yml"))).toBe(true);
    });

    test("should use generated id for filename when identifier is missing", async () => {
      mockGetIssue.mockImplementationOnce(
        async (_id: string) =>
          ({
            ...mockIssue,
            identifier: undefined,
          }) as unknown as typeof mockIssue,
      );

      await command.run({ id: "ENG-123" });

      const { readdir } = await import("node:fs/promises");
      const allFiles = await readdir(join(testDir, "modules", "shared", "issues"));
      const ymlFiles = allFiles.filter((f) => f.endsWith(".yml"));
      expect(ymlFiles.length).toBe(1);
      expect(ymlFiles[0]).toMatch(/^[A-F]{3}-\d{6}\.yml$/);
    });

    test("should pass id to LinearService.getIssue", async () => {
      mockGetIssue.mockClear();

      await command.run({ id: "ENG-456" });

      expect(mockGetIssue).toHaveBeenCalledWith("ENG-456");
    });

    test("should end YAML content with newline", async () => {
      await command.run({ id: "ENG-123" });

      const content = await Bun.file(join(testDir, "modules", "shared", "issues", "ENG-123.yml")).text();

      expect(content.endsWith("\n")).toBe(true);
    });
  });
});
