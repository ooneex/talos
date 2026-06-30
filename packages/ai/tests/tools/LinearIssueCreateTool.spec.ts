import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Issue } from "@talosjs/linear";

// Records every `createIssue` call so assertions can inspect the assembled
// Issue, and replays `createdIssue` back as the persisted result.
const createIssueCalls: Issue[] = [];
let createdIssue: Issue = {} as Issue;

const createIssue = mock((input: Issue) => {
  createIssueCalls.push(input);
  return Promise.resolve(createdIssue);
});

// Stand in for the real `LinearService` so the tool can be constructed without
// a Linear API key. The real `Issue` class is kept (only `LinearService` is mocked).
const actualLinear = await import("@talosjs/linear");
mock.module("@talosjs/linear", () => ({
  ...actualLinear,
  LinearService: class {
    createIssue = createIssue;
  },
}));

const { LinearIssueCreateTool } = await import("@/tools/LinearIssueCreateTool");

const makeTool = () => new LinearIssueCreateTool({ createIssue } as never);

beforeEach(() => {
  createIssueCalls.length = 0;
  createdIssue = {} as Issue;
});

describe("LinearIssueCreateTool metadata", () => {
  test("should expose a stable name and a description", () => {
    const tool = makeTool();

    expect(tool.getName()).toBe("linear_issue_create");
    expect(tool.getDescription()).toContain("Create a new Linear issue");
  });

  test("should require title and teamId and bound the priority", () => {
    const schema = makeTool().getInputSchema();

    expect(schema({ title: "Bug", teamId: "team-1" })).toEqual({ title: "Bug", teamId: "team-1" });
    expect((schema({ title: "Bug" }) as { summary?: string }).summary).toBeString();
    expect((schema({ title: "", teamId: "team-1" }) as { summary?: string }).summary).toBeString();
    expect((schema({ title: "Bug", teamId: "team-1", priority: 9 }) as { summary?: string }).summary).toBeString();
  });
});

describe("LinearIssueCreateTool.handler", () => {
  test("should forward only the required fields when nothing else is supplied", async () => {
    await makeTool().handler({ title: "Login broken", teamId: "team-1" });

    const input = createIssueCalls[0];
    expect(input?.title).toBe("Login broken");
    expect(input?.team?.id).toBe("team-1");
    expect(input?.description).toBeUndefined();
    expect(input?.assignee).toBeUndefined();
    expect(input?.project).toBeUndefined();
    expect(input?.priority).toBeUndefined();
    expect(input?.state).toBeUndefined();
    expect(input?.labels).toBeUndefined();
  });

  test("should map every optional field onto the issue relations", async () => {
    await makeTool().handler({
      title: "Login broken",
      teamId: "team-1",
      description: "Users cannot log in",
      assigneeId: "user-9",
      projectId: "proj-3",
      priority: 1,
      stateId: "state-7",
      labelIds: ["label-a", "label-b"],
    });

    const input = createIssueCalls[0];
    expect(input?.description).toBe("Users cannot log in");
    expect(input?.assignee?.id).toBe("user-9");
    expect(input?.project?.id).toBe("proj-3");
    expect(input?.priority).toBe(1);
    expect(input?.state).toEqual({ id: "state-7" });
    expect(input?.labels).toEqual([{ id: "label-a" }, { id: "label-b" }]);
  });

  test("should return the created issue projected to model-useful fields", async () => {
    createdIssue = {
      id: "issue-id",
      identifier: "ENG-1",
      title: "Login broken",
      url: "https://linear.app/ENG-1",
      state: { name: "Todo" },
      team: { key: "ENG" },
      labels: [{ name: "bug" }],
    } as Issue;

    const result = await makeTool().handler({ title: "Login broken", teamId: "team-1" });

    expect(result).toEqual({
      id: "issue-id",
      identifier: "ENG-1",
      title: "Login broken",
      url: "https://linear.app/ENG-1",
      state: "Todo",
      team: "ENG",
      labels: ["bug"],
    });
  });
});
