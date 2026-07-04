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

const { IssuePullCommand } = await import("@/commands/IssuePullCommand");

describe("IssuePullCommand", () => {
  let command: InstanceType<typeof IssuePullCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalApiKey: string | undefined;

  beforeEach(() => {
    command = new IssuePullCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `issue-pull-${Date.now()}`);
    originalApiKey = process.env.LINEAR_API_KEY;
    process.env.LINEAR_API_KEY = "test-api-key";
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalApiKey === undefined) {
      delete process.env.LINEAR_API_KEY;
    } else {
      process.env.LINEAR_API_KEY = originalApiKey;
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("issue:pull");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Pull an issue from Linear or Jira and save it as a YAML file");
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
      expect(content).toContain('title: "Test Issue"');
      expect(content).toContain("description: |");
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

    test("should not create file when LINEAR_API_KEY is missing", async () => {
      delete process.env.LINEAR_API_KEY;

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

    test("should not create file for an unknown provider", async () => {
      mockGetIssue.mockClear();

      await command.run({ id: "ENG-123", provider: "github" as "linear" });

      expect(existsSync(join(testDir, "modules", "shared", "issues", "ENG-123.yml"))).toBe(false);
      expect(mockGetIssue).not.toHaveBeenCalled();
    });
  });

  describe("run() with Jira provider", () => {
    const jiraIssue = {
      key: "PROJ-1",
      fields: {
        summary: "Jira Issue",
        status: { name: "To Do" },
        priority: { name: "High" },
        description: { content: [{ content: [{ text: "Jira description" }] }] },
        labels: ["bug", "backend"],
        comment: {
          comments: [
            { author: { displayName: "Bob" }, body: { content: [{ content: [{ text: "First jira comment" }] }] } },
          ],
        },
      },
    };

    let jiraResponse: { ok: boolean; status: number; json: () => Promise<unknown> };
    let mockFetch: ReturnType<typeof mock>;
    let originalFetch: typeof globalThis.fetch;
    let originalJiraEnv: Record<string, string | undefined>;

    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "issues", ".gitkeep"), "");
      process.chdir(testDir);
      mockPrompt.mockClear();
      mockGetIssue.mockClear();

      originalJiraEnv = {
        JIRA_BASE_URL: process.env.JIRA_BASE_URL,
        JIRA_EMAIL: process.env.JIRA_EMAIL,
        JIRA_API_TOKEN: process.env.JIRA_API_TOKEN,
      };
      process.env.JIRA_BASE_URL = "https://acme.atlassian.net";
      process.env.JIRA_EMAIL = "user@acme.com";
      process.env.JIRA_API_TOKEN = "jira-token";

      jiraResponse = { ok: true, status: 200, json: async () => jiraIssue };
      mockFetch = mock(async () => jiraResponse);
      originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries(originalJiraEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });

    test("should create YAML file at issues/<key>.yml", async () => {
      await command.run({ id: "PROJ-1", provider: "jira" });

      expect(existsSync(join(testDir, "modules", "shared", "issues", "PROJ-1.yml"))).toBe(true);
      expect(mockGetIssue).not.toHaveBeenCalled();
    });

    test("should call the Jira REST endpoint with Basic auth", async () => {
      await command.run({ id: "PROJ-1", provider: "jira" });

      const calls = mockFetch.mock.calls as unknown as Array<[string, { headers: Record<string, string> }]>;
      const [url, init] = calls[0];
      expect(url).toBe(
        "https://acme.atlassian.net/rest/api/3/issue/PROJ-1?fields=summary,status,priority,description,labels,comment",
      );
      const expectedAuth = Buffer.from("user@acme.com:jira-token").toString("base64");
      expect(init.headers.Authorization).toBe(`Basic ${expectedAuth}`);
    });

    test("should map Jira fields to YAML", async () => {
      await command.run({ id: "PROJ-1", provider: "jira" });

      const content = await Bun.file(join(testDir, "modules", "shared", "issues", "PROJ-1.yml")).text();

      expect(content).toContain('id: "PROJ-1"');
      expect(content).toContain('title: "Jira Issue"');
      expect(content).toContain('state: "To Do"');
      expect(content).toContain('priority: "High"');
      expect(content).toContain("description: |");
      expect(content).toContain("  Jira description");
      expect(content).toContain('  - "bug"');
      expect(content).toContain('  - "backend"');
      expect(content).toContain('  - author: "Bob"');
      expect(content).toContain('    message: "First jira comment"');
    });

    test("should not create file when Jira credentials are missing", async () => {
      delete process.env.JIRA_API_TOKEN;

      await command.run({ id: "PROJ-1", provider: "jira" });

      expect(existsSync(join(testDir, "modules", "shared", "issues", "PROJ-1.yml"))).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test("should not create file when Jira responds with an error", async () => {
      jiraResponse = { ok: false, status: 404, json: async () => ({}) };

      await command.run({ id: "PROJ-1", provider: "jira" });

      expect(existsSync(join(testDir, "modules", "shared", "issues", "PROJ-1.yml"))).toBe(false);
    });
  });
});
