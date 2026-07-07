import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const mockPrompt = mock(({ name }: { name: string }) => {
  if (name === "id") return Promise.resolve({ id: "ENG-123" });
  return Promise.resolve({});
});

mock.module("enquirer", () => ({ prompt: mockPrompt }));

const existingIssue = () => ({ id: "issue-1", identifier: "ENG-123", comments: [] });

const mockGetIssue = mock(async (_id: string): Promise<unknown> => existingIssue());
const mockGetTeams = mock(async () => [{ id: "team-1", name: "General", key: "GEN" }]);
const mockGetLabels = mock(async () => [] as Array<{ id: string; name: string }>);
const mockGetStates = mock(async () => [] as Array<{ id: string; name: string }>);
const mockCreateIssue = mock(async () => ({ id: "created-id", identifier: "ENG-1" }));
const mockUpdateIssue = mock(async () => ({ id: "issue-1" }));
const mockCreateComment = mock(async () => ({ id: "comment-1", body: "test", createdAt: new Date() }));
const mockCreateLabel = mock(async (input: { name: string }) => ({ id: "new-label-id", name: input.name }));

mock.module("@talosjs/linear", () => ({
  LinearService: class {
    getIssue = mockGetIssue;
    getTeams = mockGetTeams;
    getLabels = mockGetLabels;
    getStates = mockGetStates;
    createIssue = mockCreateIssue;
    updateIssue = mockUpdateIssue;
    createComment = mockCreateComment;
    createLabel = mockCreateLabel;
  },
  Issue: class {},
}));

mock.module("@talosjs/app-env", () => ({
  AppEnv: class {},
  loadEnv: async () => {},
}));

let linearCredentials: Record<string, string> | null;

mock.module("@/credentials", () => ({
  readCredentials: mock(async (fileName: string) => (fileName === "linear.yml" ? linearCredentials : null)),
}));

const mockLoggerError = mock(() => {});
const mockLoggerSuccess = mock(() => {});

mock.module("@talosjs/logger", () => ({
  TerminalLogger: class {
    error = mockLoggerError;
    success = mockLoggerSuccess;
  },
}));

const { IssuePushCommand } = await import("@/commands/IssuePushCommand");

describe("IssuePushCommand", () => {
  let command: InstanceType<typeof IssuePushCommand>;
  let testDir: string;
  let originalCwd: string;
  let mockStdoutWrite: ReturnType<typeof spyOn<typeof process.stdout, "write">>;

  const writeIssueFile = async (id: string, content: string, module = "shared") => {
    await Bun.write(join(testDir, "modules", module, "issues", `${id}.yml`), content);
  };

  beforeEach(async () => {
    mockStdoutWrite = spyOn(process.stdout, "write").mockImplementation(() => true);
    command = new IssuePushCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `issue-push-${Date.now()}`);
    linearCredentials = { token: "test-api-key" };

    await Bun.write(join(testDir, "modules", "shared", "issues", ".gitkeep"), "");
    process.chdir(testDir);

    mockPrompt.mockImplementation(({ name }: { name: string }) => {
      if (name === "id") return Promise.resolve({ id: "ENG-123" });
      return Promise.resolve({});
    });
    mockPrompt.mockClear();
    mockGetIssue.mockClear();
    mockGetTeams.mockClear();
    mockGetLabels.mockClear();
    mockGetStates.mockClear();
    mockCreateIssue.mockClear();
    mockUpdateIssue.mockClear();
    mockCreateComment.mockClear();
    mockCreateLabel.mockClear();
    mockLoggerError.mockClear();
    mockLoggerSuccess.mockClear();

    // Default: getIssue returns an existing Linear issue (update path)
    mockGetIssue.mockImplementation(async () => existingIssue());
    mockGetTeams.mockImplementation(async () => [{ id: "team-1", name: "General", key: "GEN" }]);
    mockGetLabels.mockImplementation(async () => []);
    mockGetStates.mockImplementation(async () => []);
    mockCreateIssue.mockImplementation(async () => ({ id: "created-id", identifier: "ENG-1" }));
  });

  afterEach(() => {
    mockStdoutWrite.mockRestore();
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("issue:push");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Push a local issue YAML to Linear (create or update)");
    });
  });

  describe("run()", () => {
    test("should log error and return early when Linear credentials are missing", async () => {
      linearCredentials = null;
      await writeIssueFile("ENG-123", 'id: "ENG-123"\ntitle: "Test"\n');

      await command.run({ id: "ENG-123" });

      expect(mockLoggerError).toHaveBeenCalledTimes(1);
      expect(mockGetIssue).not.toHaveBeenCalled();
    });

    test("should log error and return early when issue file is not found", async () => {
      await command.run({ id: "MISSING-999" });

      expect(mockLoggerError).toHaveBeenCalledTimes(1);
      expect(mockGetIssue).not.toHaveBeenCalled();
    });

    test("should prompt for id when not provided", async () => {
      await writeIssueFile("ENG-123", 'id: "ENG-123"\ntitle: "New Issue"\n');

      await command.run({});

      const calls = mockPrompt.mock.calls as unknown as Array<[{ name: string }]>;
      const idCall = calls.find((c) => c[0]?.name === "id");
      expect(idCall).toBeDefined();
    });

    test("should call getIssue with parsed id from YAML, not filename", async () => {
      await writeIssueFile("local-name", 'id: "ENG-456"\ntitle: "Test"\n');

      await command.run({ id: "local-name" });

      expect(mockGetIssue).toHaveBeenCalledWith("ENG-456");
    });

    test("should call getIssue with filename id when YAML has no id field", async () => {
      await writeIssueFile("ENG-123", 'title: "Test Issue"\n');

      await command.run({ id: "ENG-123" });

      expect(mockGetIssue).toHaveBeenCalledWith("ENG-123");
    });

    test("should call updateIssue when getIssue returns an existing issue", async () => {
      await writeIssueFile("ENG-123", 'id: "ENG-123"\ntitle: "Existing Issue"\n');

      await command.run({ id: "ENG-123" });

      expect(mockUpdateIssue).toHaveBeenCalledTimes(1);
    });

    test("should call createIssue when the issue is not found in Linear", async () => {
      mockGetIssue.mockImplementation(async () => {
        throw new Error("Not found");
      });
      await writeIssueFile("ENG-123", 'id: "ENG-123"\ntitle: "New Issue"\n');

      await command.run({ id: "ENG-123" });

      expect(mockCreateIssue).toHaveBeenCalledTimes(1);
      expect(mockUpdateIssue).not.toHaveBeenCalled();
    });

    test("should use custom module directory when module option is provided", async () => {
      await Bun.write(join(testDir, "modules", "my-module", "issues", ".gitkeep"), "");
      await writeIssueFile("ENG-123", 'title: "Test"\n', "my-module");

      await command.run({ id: "ENG-123", module: "my-module" });

      expect(mockUpdateIssue).toHaveBeenCalledTimes(1);
    });
  });

  describe("create path (pushCreate)", () => {
    beforeEach(() => {
      mockGetIssue.mockImplementation(async () => {
        throw new Error("Not found");
      });
    });

    test("should log error and return early when title is missing", async () => {
      await writeIssueFile("ENG-123", 'id: "ENG-123"\nstate: "todo"\n');

      await command.run({ id: "ENG-123" });

      expect(mockLoggerError).toHaveBeenCalledTimes(1);
      expect(mockCreateIssue).not.toHaveBeenCalled();
    });

    test("should log error and return early when no teams found", async () => {
      mockGetTeams.mockImplementation(async () => []);
      await writeIssueFile("ENG-123", 'title: "New Issue"\n');

      await command.run({ id: "ENG-123" });

      expect(mockLoggerError).toHaveBeenCalledTimes(1);
      expect(mockCreateIssue).not.toHaveBeenCalled();
    });

    test("should use the General team without prompting", async () => {
      await writeIssueFile("ENG-123", 'title: "New Issue"\n');

      await command.run({ id: "ENG-123" });

      const calls = mockPrompt.mock.calls as unknown as Array<[{ name: string }]>;
      const teamCall = calls.find((c) => c[0]?.name === "teamKey");
      expect(teamCall).toBeUndefined();
    });

    test("should match the General team by name case-insensitively", async () => {
      mockGetTeams.mockImplementation(async () => [
        { id: "eng-1", name: "Engineering", key: "ENG" },
        { id: "gen-1", name: "general", key: "GEN" },
      ]);
      await writeIssueFile("ENG-123", 'title: "New Issue"\n');

      await command.run({ id: "ENG-123" });

      const calls = mockCreateIssue.mock.calls as unknown as Array<[{ team?: { id: string } }]>;
      expect(calls[0]?.[0]?.team?.id).toBe("gen-1");
    });

    test("should log error when no General team is found", async () => {
      mockGetTeams.mockImplementation(async () => [{ id: "eng-1", name: "Engineering", key: "ENG" }]);
      await writeIssueFile("ENG-123", 'title: "New Issue"\n');

      await command.run({ id: "ENG-123" });

      expect(mockLoggerError).toHaveBeenCalledTimes(1);
      expect(mockCreateIssue).not.toHaveBeenCalled();
    });

    test("should call createIssue with title and the General team", async () => {
      await writeIssueFile("ENG-123", 'title: "Brand New Issue"\n');

      await command.run({ id: "ENG-123" });

      expect(mockCreateIssue).toHaveBeenCalledTimes(1);
      const calls = mockCreateIssue.mock.calls as unknown as Array<[{ title?: string; team?: { id: string } }]>;
      expect(calls[0]?.[0]?.title).toBe("Brand New Issue");
      expect(calls[0]?.[0]?.team?.id).toBe("team-1");
    });

    test("should call createIssue with mapped priority", async () => {
      await writeIssueFile("ENG-123", 'title: "Issue"\npriority: "urgent"\n');

      await command.run({ id: "ENG-123" });

      const calls = mockCreateIssue.mock.calls as unknown as Array<[{ priority?: number }]>;
      expect(calls[0]?.[0]?.priority).toBe(1);
    });

    test("should call createComment for each comment after issue creation", async () => {
      await writeIssueFile(
        "ENG-123",
        'title: "Issue"\ncomments:\n  - author: "Alice"\n    message: "First comment"\n  - author: null\n    message: "Second comment"\n',
      );

      await command.run({ id: "ENG-123" });

      expect(mockCreateComment).toHaveBeenCalledTimes(2);
    });

    test("should rename file when created identifier differs from local id", async () => {
      mockCreateIssue.mockImplementation(async () => ({ id: "created-id", identifier: "ENG-999" }));
      await writeIssueFile("local-draft", 'title: "New Issue"\n');

      await command.run({ id: "local-draft" });

      expect(existsSync(join(testDir, "modules", "shared", "issues", "ENG-999.yml"))).toBe(true);
      expect(existsSync(join(testDir, "modules", "shared", "issues", "local-draft.yml"))).toBe(false);
    });

    test("should update id field in renamed file", async () => {
      mockCreateIssue.mockImplementation(async () => ({ id: "created-id", identifier: "ENG-999" }));
      await writeIssueFile("local-draft", 'id: "local-draft"\ntitle: "New Issue"\n');

      await command.run({ id: "local-draft" });

      const content = await Bun.file(join(testDir, "modules", "shared", "issues", "ENG-999.yml")).text();
      expect(content).toContain('id: "ENG-999"');
    });

    test("should not rename file when identifier matches local id", async () => {
      mockCreateIssue.mockImplementation(async () => ({ id: "created-id", identifier: "ENG-123" }));
      await writeIssueFile("ENG-123", 'title: "New Issue"\n');

      await command.run({ id: "ENG-123" });

      expect(existsSync(join(testDir, "modules", "shared", "issues", "ENG-123.yml"))).toBe(true);
    });

    test("should log success after creating issue", async () => {
      await writeIssueFile("ENG-123", 'title: "New Issue"\n');

      await command.run({ id: "ENG-123" });

      expect(mockLoggerSuccess).toHaveBeenCalled();
    });
  });

  describe("update path (pushUpdate)", () => {
    test("should pass title from YAML to updateIssue", async () => {
      await writeIssueFile("ENG-123", 'id: "ENG-123"\ntitle: "Updated Title"\n');

      await command.run({ id: "ENG-123" });

      const calls = mockUpdateIssue.mock.calls as unknown as Array<[string, { title?: string }]>;
      expect(calls[0]?.[1]?.title).toBe("Updated Title");
    });

    test("should map priority string to number in updateIssue", async () => {
      await writeIssueFile("ENG-123", 'id: "ENG-123"\ntitle: "Issue"\npriority: "high"\n');

      await command.run({ id: "ENG-123" });

      const calls = mockUpdateIssue.mock.calls as unknown as Array<[string, { priority?: number }]>;
      expect(calls[0]?.[1]?.priority).toBe(2);
    });

    test("should resolve existing state by name and pass stateId to updateIssue", async () => {
      mockGetStates.mockImplementation(async () => [{ id: "state-1", name: "In Progress" }]);
      await writeIssueFile("ENG-123", 'id: "ENG-123"\ntitle: "Issue"\nstate: "In Progress"\n');

      await command.run({ id: "ENG-123" });

      const calls = mockUpdateIssue.mock.calls as unknown as Array<[string, { state?: { id: string } }]>;
      expect(calls[0]?.[1]?.state?.id).toBe("state-1");
    });

    test("should not set state when not found in getStates", async () => {
      mockGetStates.mockImplementation(async () => []);
      await writeIssueFile("ENG-123", 'id: "ENG-123"\ntitle: "Issue"\nstate: "Unknown State"\n');

      await command.run({ id: "ENG-123" });

      const calls = mockUpdateIssue.mock.calls as unknown as Array<[string, { state?: { id: string } }]>;
      expect(calls[0]?.[1]?.state).toBeUndefined();
    });

    test("should resolve existing label by name and include its id in updateIssue", async () => {
      mockGetLabels.mockImplementation(async () => [{ id: "label-1", name: "bug" }]);
      await writeIssueFile("ENG-123", 'id: "ENG-123"\ntitle: "Issue"\nlabels:\n  - "bug"\n');

      await command.run({ id: "ENG-123" });

      const calls = mockUpdateIssue.mock.calls as unknown as Array<[string, { labels?: Array<{ id: string }> }]>;
      expect(calls[0]?.[1]?.labels).toContainEqual({ id: "label-1" });
    });

    test("should create label when not found in getLabels", async () => {
      mockGetLabels.mockImplementation(async () => []);
      await writeIssueFile("ENG-123", 'id: "ENG-123"\ntitle: "Issue"\nlabels:\n  - "new-label"\n');

      await command.run({ id: "ENG-123" });

      expect(mockCreateLabel).toHaveBeenCalledTimes(1);
      const calls = mockCreateLabel.mock.calls as unknown as Array<[{ name: string }]>;
      expect(calls[0]?.[0]?.name).toBe("new-label");
    });

    test("should not call createComment for comments already in existing issue", async () => {
      mockGetIssue.mockImplementation(async () => ({
        id: "issue-1",
        identifier: "ENG-123",
        comments: [{ id: "c1", body: "Existing comment", createdAt: new Date() }],
      }));
      await writeIssueFile(
        "ENG-123",
        'id: "ENG-123"\ntitle: "Issue"\ncomments:\n  - author: null\n    message: "Existing comment"\n',
      );

      await command.run({ id: "ENG-123" });

      expect(mockCreateComment).not.toHaveBeenCalled();
    });

    test("should call createComment for new comments not in existing issue", async () => {
      mockGetIssue.mockImplementation(async () => ({
        id: "issue-1",
        identifier: "ENG-123",
        comments: [],
      }));
      await writeIssueFile(
        "ENG-123",
        'id: "ENG-123"\ntitle: "Issue"\ncomments:\n  - author: null\n    message: "New comment"\n',
      );

      await command.run({ id: "ENG-123" });

      expect(mockCreateComment).toHaveBeenCalledTimes(1);
      const calls = mockCreateComment.mock.calls as unknown as Array<[string, string]>;
      expect(calls[0]?.[1]).toBe("New comment");
    });

    test("should log success after updating issue", async () => {
      await writeIssueFile("ENG-123", 'id: "ENG-123"\ntitle: "Issue"\n');

      await command.run({ id: "ENG-123" });

      expect(mockLoggerSuccess).toHaveBeenCalled();
    });
  });

  describe("parseIssueYaml (via run)", () => {
    test("should parse block scalar description", async () => {
      await writeIssueFile("ENG-123", 'id: "ENG-123"\ntitle: "Issue"\ndescription: |\n  Line one\n  Line two\n');

      await command.run({ id: "ENG-123" });

      const calls = mockUpdateIssue.mock.calls as unknown as Array<[string, { description?: string }]>;
      expect(calls[0]?.[1]?.description).toBe("Line one\nLine two");
    });

    test("should not set description when description is null", async () => {
      await writeIssueFile("ENG-123", 'id: "ENG-123"\ntitle: "Issue"\ndescription: null\n');

      await command.run({ id: "ENG-123" });

      const calls = mockUpdateIssue.mock.calls as unknown as Array<[string, { description?: string }]>;
      expect(calls[0]?.[1]?.description).toBeUndefined();
    });

    test("should parse empty labels list", async () => {
      await writeIssueFile("ENG-123", 'id: "ENG-123"\ntitle: "Issue"\nlabels: []\n');

      await command.run({ id: "ENG-123" });

      const calls = mockUpdateIssue.mock.calls as unknown as Array<[string, { labels?: Array<{ id: string }> }]>;
      expect(calls[0]?.[1]?.labels).toHaveLength(0);
    });

    test("should parse labels list and resolve each by name", async () => {
      mockGetLabels.mockImplementation(async () => [
        { id: "l1", name: "bug" },
        { id: "l2", name: "frontend" },
      ]);
      await writeIssueFile("ENG-123", 'id: "ENG-123"\ntitle: "Issue"\nlabels:\n  - "bug"\n  - "frontend"\n');

      await command.run({ id: "ENG-123" });

      const calls = mockUpdateIssue.mock.calls as unknown as Array<[string, { labels?: Array<{ id: string }> }]>;
      expect(calls[0]?.[1]?.labels).toContainEqual({ id: "l1" });
      expect(calls[0]?.[1]?.labels).toContainEqual({ id: "l2" });
    });

    test("should parse comments and call createComment for each new one", async () => {
      await writeIssueFile(
        "ENG-123",
        'id: "ENG-123"\ntitle: "Issue"\ncomments:\n  - author: "Alice"\n    message: "Hello"\n',
      );

      await command.run({ id: "ENG-123" });

      expect(mockCreateComment).toHaveBeenCalledTimes(1);
      const calls = mockCreateComment.mock.calls as unknown as Array<[string, string]>;
      expect(calls[0]?.[1]).toBe("Hello");
    });

    test("should map priority 'urgent' to 1", async () => {
      await writeIssueFile("ENG-123", 'id: "ENG-123"\ntitle: "Issue"\npriority: "urgent"\n');

      await command.run({ id: "ENG-123" });

      const calls = mockUpdateIssue.mock.calls as unknown as Array<[string, { priority?: number }]>;
      expect(calls[0]?.[1]?.priority).toBe(1);
    });

    test("should map priority 'medium' and 'normal' to 3", async () => {
      await writeIssueFile("ENG-123", 'id: "ENG-123"\ntitle: "Issue"\npriority: "medium"\n');
      await command.run({ id: "ENG-123" });

      const calls = mockUpdateIssue.mock.calls as unknown as Array<[string, { priority?: number }]>;
      expect(calls[0]?.[1]?.priority).toBe(3);

      mockUpdateIssue.mockClear();
      await writeIssueFile("ENG-123", 'id: "ENG-123"\ntitle: "Issue"\npriority: "normal"\n');
      await command.run({ id: "ENG-123" });

      const calls2 = mockUpdateIssue.mock.calls as unknown as Array<[string, { priority?: number }]>;
      expect(calls2[0]?.[1]?.priority).toBe(3);
    });

    test("should map priority 'low' to 4", async () => {
      await writeIssueFile("ENG-123", 'id: "ENG-123"\ntitle: "Issue"\npriority: "low"\n');

      await command.run({ id: "ENG-123" });

      const calls = mockUpdateIssue.mock.calls as unknown as Array<[string, { priority?: number }]>;
      expect(calls[0]?.[1]?.priority).toBe(4);
    });
  });

  describe("resolveState", () => {
    test("should set stateId when state is found in getStates", async () => {
      mockGetStates.mockImplementation(async () => [{ id: "s1", name: "Todo" }]);
      await writeIssueFile("ENG-123", 'id: "ENG-123"\ntitle: "Issue"\nstate: "Todo"\n');

      await command.run({ id: "ENG-123" });

      const calls = mockUpdateIssue.mock.calls as unknown as Array<[string, { state?: { id: string } }]>;
      expect(calls[0]?.[1]?.state?.id).toBe("s1");
    });

    test("should leave state unset when not found in getStates", async () => {
      mockGetStates.mockImplementation(async () => []);
      await writeIssueFile("ENG-123", 'id: "ENG-123"\ntitle: "Issue"\nstate: "Custom State"\n');

      await command.run({ id: "ENG-123" });

      const calls = mockUpdateIssue.mock.calls as unknown as Array<[string, { state?: { id: string } }]>;
      expect(calls[0]?.[1]?.state).toBeUndefined();
    });
  });
});
