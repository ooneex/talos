import { beforeEach, describe, expect, mock, test } from "bun:test";

// Records every `deleteIssue` call so assertions can inspect the id, and
// replays `deleteResult` back as the outcome.
const deleteIssueCalls: string[] = [];
let deleteResult = true;

const deleteIssue = mock((id: string) => {
  deleteIssueCalls.push(id);
  return Promise.resolve(deleteResult);
});

// Stand in for the real `LinearService` so the tool can be constructed without
// a Linear API key.
mock.module("@talosjs/linear", () => ({
  LinearService: class {
    deleteIssue = deleteIssue;
  },
}));

const { LinearIssueDeleteTool } = await import("@/tools/LinearIssueDeleteTool");

const makeTool = () => new LinearIssueDeleteTool({ deleteIssue } as never);

beforeEach(() => {
  deleteIssueCalls.length = 0;
  deleteResult = true;
});

describe("LinearIssueDeleteTool metadata", () => {
  test("should expose a stable name and a description", () => {
    const tool = makeTool();

    expect(tool.getName()).toBe("linear_issue_delete");
    expect(tool.getDescription()).toContain("Delete a Linear issue");
  });

  test("should require a non-empty id", () => {
    const schema = makeTool().getInputSchema();

    expect(schema({ id: "issue-1" })).toEqual({ id: "issue-1" });
    expect((schema({}) as { summary?: string }).summary).toBeString();
    expect((schema({ id: "" }) as { summary?: string }).summary).toBeString();
  });
});

describe("LinearIssueDeleteTool.handler", () => {
  test("should delete the issue and report success", async () => {
    const result = await makeTool().handler({ id: "issue-1" });

    expect(deleteIssueCalls).toEqual(["issue-1"]);
    expect(result).toEqual({ id: "issue-1", deleted: true });
  });

  test("should echo a failed deletion", async () => {
    deleteResult = false;

    const result = await makeTool().handler({ id: "issue-1" });

    expect(result).toEqual({ id: "issue-1", deleted: false });
  });
});
