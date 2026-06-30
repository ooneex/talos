import { describe, expect, test } from "bun:test";
import { Issue, mapIssue } from "@/Issue";

const makeRawIssue = (overrides: Record<string, unknown> = {}) => ({
  id: "issue-1",
  title: "Test Issue",
  description: "Test description",
  priority: 2,
  url: "https://linear.app/team/issue/TEAM-1",
  identifier: "TEAM-1",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-02"),
  team: null,
  state: null,
  assignee: null,
  project: null,
  labels: () => Promise.resolve({ nodes: [] }),
  comments: () => Promise.resolve({ nodes: [] }),
  ...overrides,
});

describe("Issue", () => {
  test("should create an instance with undefined properties", () => {
    const issue = new Issue();

    expect(issue.id).toBeUndefined();
    expect(issue.title).toBeUndefined();
    expect(issue.description).toBeUndefined();
    expect(issue.priority).toBeUndefined();
    expect(issue.url).toBeUndefined();
    expect(issue.identifier).toBeUndefined();
    expect(issue.createdAt).toBeUndefined();
    expect(issue.updatedAt).toBeUndefined();
    expect(issue.team).toBeUndefined();
    expect(issue.assignee).toBeUndefined();
    expect(issue.project).toBeUndefined();
    expect(issue.state).toBeUndefined();
    expect(issue.labels).toBeUndefined();
    expect(issue.comments).toBeUndefined();
  });

  test("should allow setting all properties", () => {
    const issue = new Issue();
    issue.id = "abc-123";
    issue.title = "My Issue";
    issue.priority = 1;
    issue.labels = [{ id: "label-1", name: "Bug", color: "#FF0000" }];

    expect(issue.id).toBe("abc-123");
    expect(issue.title).toBe("My Issue");
    expect(issue.priority).toBe(1);
    expect(issue.labels).toHaveLength(1);
  });
});

describe("mapIssue", () => {
  test("should map basic scalar fields", async () => {
    const issue = await mapIssue(makeRawIssue() as never);

    expect(issue.id).toBe("issue-1");
    expect(issue.title).toBe("Test Issue");
    expect(issue.description).toBe("Test description");
    expect(issue.priority).toBe(2);
    expect(issue.url).toBe("https://linear.app/team/issue/TEAM-1");
    expect(issue.identifier).toBe("TEAM-1");
    expect(issue.createdAt).toEqual(new Date("2024-01-01"));
    expect(issue.updatedAt).toEqual(new Date("2024-01-02"));
  });

  test("should not set description when null", async () => {
    const issue = await mapIssue(makeRawIssue({ description: null }) as never);

    expect(issue.description).toBeUndefined();
  });

  test("should map team when present", async () => {
    const raw = makeRawIssue({
      team: Promise.resolve({ id: "team-1", name: "Engineering", key: "ENG" }),
    });
    const issue = await mapIssue(raw as never);

    expect(issue.team).toEqual({ id: "team-1", name: "Engineering", key: "ENG" });
  });

  test("should not set team when absent", async () => {
    const issue = await mapIssue(makeRawIssue({ team: null }) as never);

    expect(issue.team).toBeUndefined();
  });

  test("should map state when present", async () => {
    const raw = makeRawIssue({
      state: Promise.resolve({ id: "state-1", name: "In Progress", color: "#0000FF", type: "started" }),
    });
    const issue = await mapIssue(raw as never);

    expect(issue.state).toEqual({ id: "state-1", name: "In Progress", color: "#0000FF", type: "started" });
  });

  test("should not set state when absent", async () => {
    const issue = await mapIssue(makeRawIssue({ state: null }) as never);

    expect(issue.state).toBeUndefined();
  });

  test("should map assignee when present", async () => {
    const raw = makeRawIssue({
      assignee: Promise.resolve({ id: "user-1", name: "Jane", email: "jane@example.com", displayName: "Jane D." }),
    });
    const issue = await mapIssue(raw as never);

    expect(issue.assignee).toEqual({
      id: "user-1",
      name: "Jane",
      email: "jane@example.com",
      displayName: "Jane D.",
    });
  });

  test("should not set assignee when absent", async () => {
    const issue = await mapIssue(makeRawIssue({ assignee: null }) as never);

    expect(issue.assignee).toBeUndefined();
  });

  test("should map project when present", async () => {
    const raw = makeRawIssue({
      project: Promise.resolve({
        id: "proj-1",
        name: "Q1 Roadmap",
        description: "Q1",
        url: "https://linear.app/proj",
      }),
    });
    const issue = await mapIssue(raw as never);

    expect(issue.project).toEqual({
      id: "proj-1",
      name: "Q1 Roadmap",
      description: "Q1",
      url: "https://linear.app/proj",
    });
  });

  test("should not include description in project when null", async () => {
    const raw = makeRawIssue({
      project: Promise.resolve({ id: "proj-1", name: "Q1", description: null, url: "https://linear.app/proj" }),
    });
    const issue = await mapIssue(raw as never);

    expect(issue.project?.description).toBeUndefined();
  });

  test("should not set project when absent", async () => {
    const issue = await mapIssue(makeRawIssue({ project: null }) as never);

    expect(issue.project).toBeUndefined();
  });

  test("should map labels array", async () => {
    const raw = makeRawIssue({
      labels: () => Promise.resolve({ nodes: [{ id: "label-1", name: "Bug", color: "#FF0000" }] }),
    });
    const issue = await mapIssue(raw as never);

    expect(issue.labels).toHaveLength(1);
    expect(issue.labels?.[0]).toEqual({ id: "label-1", name: "Bug", color: "#FF0000" });
  });

  test("should map empty labels array", async () => {
    const issue = await mapIssue(makeRawIssue() as never);

    expect(issue.labels).toHaveLength(0);
  });

  test("should map comments with user", async () => {
    const raw = makeRawIssue({
      comments: () =>
        Promise.resolve({
          nodes: [
            {
              id: "comment-1",
              body: "Hello",
              createdAt: new Date("2024-01-01"),
              user: Promise.resolve({ id: "user-1", name: "Jane", email: "jane@example.com", displayName: "Jane D." }),
            },
          ],
        }),
    });
    const issue = await mapIssue(raw as never);

    expect(issue.comments).toHaveLength(1);
    expect(issue.comments?.[0]?.id).toBe("comment-1");
    expect(issue.comments?.[0]?.body).toBe("Hello");
    expect(issue.comments?.[0]?.user).toEqual({
      id: "user-1",
      name: "Jane",
      email: "jane@example.com",
      displayName: "Jane D.",
    });
  });

  test("should map comments without user", async () => {
    const raw = makeRawIssue({
      comments: () =>
        Promise.resolve({
          nodes: [
            {
              id: "comment-1",
              body: "Hello",
              createdAt: new Date("2024-01-01"),
              user: Promise.resolve(null),
            },
          ],
        }),
    });
    const issue = await mapIssue(raw as never);

    expect(issue.comments?.[0]?.user).toBeUndefined();
  });

  test("should map empty comments array", async () => {
    const issue = await mapIssue(makeRawIssue() as never);

    expect(issue.comments).toHaveLength(0);
  });

  test("should return an Issue instance", async () => {
    const issue = await mapIssue(makeRawIssue() as never);

    expect(issue).toBeInstanceOf(Issue);
  });
});
