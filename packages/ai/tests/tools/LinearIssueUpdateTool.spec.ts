import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Issue } from "@talosjs/linear";

// Records every `updateIssue` call so assertions can inspect the id and the
// assembled Issue patch, and replays `updatedIssue` back as the result.
const updateIssueCalls: Array<{ id: string; input: Issue }> = [];
let updatedIssue: Issue = {} as Issue;

const updateIssue = mock((id: string, input: Issue) => {
  updateIssueCalls.push({ id, input });
  return Promise.resolve(updatedIssue);
});

// Stand in for the real `LinearService`; keep the real `Issue` class.
const actualLinear = await import("@talosjs/linear");
mock.module("@talosjs/linear", () => ({
  ...actualLinear,
  LinearService: class {
    updateIssue = updateIssue;
  },
}));

const { LinearIssueUpdateTool } = await import("@/tools/LinearIssueUpdateTool");

const makeTool = () => new LinearIssueUpdateTool({ updateIssue } as never);

beforeEach(() => {
  updateIssueCalls.length = 0;
  updatedIssue = {} as Issue;
});

describe("LinearIssueUpdateTool metadata", () => {
  test("should expose a stable name and a description", () => {
    const tool = makeTool();

    expect(tool.getName()).toBe("linear_issue_update");
    expect(tool.getDescription()).toContain("Update an existing Linear issue");
  });

  test("should require id and bound the priority", () => {
    const schema = makeTool().getInputSchema();

    expect(schema({ id: "issue-1" })).toEqual({ id: "issue-1" });
    expect((schema({}) as { summary?: string }).summary).toBeString();
    expect((schema({ id: "" }) as { summary?: string }).summary).toBeString();
    expect((schema({ id: "issue-1", priority: 9 }) as { summary?: string }).summary).toBeString();
  });
});

describe("LinearIssueUpdateTool.handler", () => {
  test("should forward the id and leave a bare patch when only the id is given", async () => {
    await makeTool().handler({ id: "issue-1" });

    const call = updateIssueCalls[0];
    expect(call?.id).toBe("issue-1");
    expect(call?.input.title).toBeUndefined();
    expect(call?.input.description).toBeUndefined();
    expect(call?.input.assignee).toBeUndefined();
    expect(call?.input.project).toBeUndefined();
    expect(call?.input.priority).toBeUndefined();
    expect(call?.input.state).toBeUndefined();
    expect(call?.input.labels).toBeUndefined();
  });

  test("should map every provided field onto the issue patch", async () => {
    await makeTool().handler({
      id: "issue-1",
      title: "New title",
      description: "New body",
      assigneeId: "user-9",
      projectId: "proj-3",
      priority: 2,
      stateId: "state-7",
      labelIds: ["label-a", "label-b"],
    });

    const input = updateIssueCalls[0]?.input;
    expect(input?.title).toBe("New title");
    expect(input?.description).toBe("New body");
    expect(input?.assignee?.id).toBe("user-9");
    expect(input?.project?.id).toBe("proj-3");
    expect(input?.priority).toBe(2);
    expect(input?.state).toEqual({ id: "state-7" });
    expect(input?.labels).toEqual([{ id: "label-a" }, { id: "label-b" }]);
  });

  test("should return the updated issue projected to model-useful fields", async () => {
    updatedIssue = {
      id: "issue-id",
      identifier: "ENG-1",
      title: "New title",
      state: { name: "In Progress" },
      team: { key: "ENG" },
      labels: [{ name: "bug" }],
    } as Issue;

    const result = await makeTool().handler({ id: "issue-1", title: "New title" });

    expect(result).toEqual({
      id: "issue-id",
      identifier: "ENG-1",
      title: "New title",
      state: "In Progress",
      team: "ENG",
      labels: ["bug"],
    });
  });
});
