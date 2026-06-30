import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Issue } from "@talosjs/linear";

// Records every `getIssues` call so assertions can inspect the team and filter
// the tool assembles, and replays `issuesResult` back as the matched issues.
const getIssuesCalls: Array<{ teamId: string | undefined; filter: unknown }> = [];
let issuesResult: Issue[] = [];

const getIssues = mock((teamId?: string, filter?: unknown) => {
  getIssuesCalls.push({ teamId, filter });
  return Promise.resolve(issuesResult);
});

// Stand in for the real `LinearService` so the tool can be constructed without
// a Linear API key. `inject` is a no-op decorator here.
mock.module("@talosjs/linear", () => ({
  LinearService: class {
    getIssues = getIssues;
  },
}));

const { LinearSearchTool } = await import("@/tools/LinearSearchTool");

const makeIssue = (overrides: Partial<Issue> = {}): Issue =>
  ({
    id: "issue-id",
    identifier: "ENG-1",
    title: "Login is broken",
    description: "Users cannot log in",
    priority: 2,
    url: "https://linear.app/ENG-1",
    state: { name: "In Progress" },
    assignee: { displayName: "Ada" },
    team: { key: "ENG" },
    labels: [{ name: "bug" }, { name: "regression" }],
    ...overrides,
  }) as Issue;

const makeTool = () => new LinearSearchTool({ getIssues } as never);

beforeEach(() => {
  getIssuesCalls.length = 0;
  issuesResult = [];
});

describe("LinearSearchTool metadata", () => {
  test("should expose a stable name and a description", () => {
    const tool = makeTool();

    expect(tool.getName()).toBe("linear_search");
    expect(tool.getDescription()).toContain("Search Linear issues");
  });

  test("should accept valid input and reject an empty query", () => {
    const schema = makeTool().getInputSchema();

    expect(schema({ query: "broken login" })).toEqual({ query: "broken login" });
    expect((schema({ query: "" }) as { summary?: string }).summary).toBeString();
    expect((schema({}) as { summary?: string }).summary).toBeString();
  });
});

describe("LinearSearchTool.handler", () => {
  test("should search title and description with a case-insensitive filter", async () => {
    issuesResult = [makeIssue()];

    await makeTool().handler({ query: "login" });

    expect(getIssuesCalls[0]?.teamId).toBeUndefined();
    expect(getIssuesCalls[0]?.filter).toEqual({
      or: [{ title: { containsIgnoreCase: "login" } }, { description: { containsIgnoreCase: "login" } }],
    });
  });

  test("should forward an explicit team id", async () => {
    await makeTool().handler({ query: "login", teamId: "team-123" });

    expect(getIssuesCalls[0]?.teamId).toBe("team-123");
  });

  test("should project issues down to model-useful fields", async () => {
    issuesResult = [makeIssue()];

    const [result] = await makeTool().handler({ query: "login" });

    expect(result).toEqual({
      id: "issue-id",
      identifier: "ENG-1",
      title: "Login is broken",
      description: "Users cannot log in",
      priority: 2,
      url: "https://linear.app/ENG-1",
      state: "In Progress",
      assignee: "Ada",
      team: "ENG",
      labels: ["bug", "regression"],
    });
  });

  test("should omit absent optional fields and default labels to an empty array", async () => {
    issuesResult = [{ id: "bare" } as Issue];

    const [result] = await makeTool().handler({ query: "login" });

    expect(result).toEqual({ id: "bare", labels: [] });
  });

  test("should cap the number of returned issues at the requested limit", async () => {
    issuesResult = Array.from({ length: 5 }, (_, i) => makeIssue({ id: `issue-${i}` }));

    const results = await makeTool().handler({ query: "login", limit: 2 });

    expect(results).toHaveLength(2);
    expect(results.map((r: { id: string }) => r.id)).toEqual(["issue-0", "issue-1"]);
  });
});
