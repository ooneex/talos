import { describe, expect, mock, test } from "bun:test";
import type { AppEnv } from "@talosjs/app-env";
import { LinearException, LinearService } from "@/index";

const mockTeam = { id: "team-1", name: "Engineering", key: "ENG" };
const mockState = {
  id: "state-1",
  name: "In Progress",
  color: "#0000FF",
  type: "started",
  description: "Active work",
  position: 1,
  teamId: "team-1",
};
const mockProject = {
  id: "project-1",
  name: "Q1 Roadmap",
  description: "Q1 project",
  url: "https://linear.app/team/project/project-1",
};
const mockViewer = { id: "user-1", name: "Jane Doe", email: "jane@example.com", displayName: "Jane" };
const mockLabel = { id: "label-1", name: "Bug", color: "#FF0000", description: "Bug label", teamId: "team-1" };

const mockIssue = {
  id: "issue-1",
  title: "Test Issue",
  description: "Test description",
  priority: 2,
  url: "https://linear.app/team/issue/issue-1",
  identifier: "TEAM-1",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-02"),
  team: Promise.resolve(mockTeam),
  state: Promise.resolve(mockState),
  assignee: Promise.resolve(null),
  project: Promise.resolve(null),
  labels: () => Promise.resolve({ nodes: [] }),
  comments: () => Promise.resolve({ nodes: [] }),
};

mock.module("@linear/sdk", () => ({
  LinearClient: class {
    issue = async (_id: string) => mockIssue;
    issues = async () => ({ nodes: [mockIssue] });
    createIssue = async () => ({ issue: Promise.resolve(mockIssue) });
    updateIssue = async () => ({ issue: Promise.resolve(mockIssue) });
    deleteIssue = async () => ({ success: true });
    teams = async () => ({ nodes: [mockTeam] });
    projects = async () => ({ nodes: [mockProject] });
    get viewer() {
      return Promise.resolve(mockViewer);
    }
    issueLabel = async (_id: string) => mockLabel;
    issueLabels = async () => ({ nodes: [mockLabel] });
    createIssueLabel = async () => ({ issueLabel: Promise.resolve(mockLabel) });
    updateIssueLabel = async () => ({ issueLabel: Promise.resolve(mockLabel) });
    deleteIssueLabel = async () => ({ success: true });
    workflowState = async (_id: string) => mockState;
    workflowStates = async () => ({ nodes: [mockState] });
    createWorkflowState = async () => ({ workflowState: Promise.resolve(mockState) });
    updateWorkflowState = async () => ({ workflowState: Promise.resolve(mockState) });
    archiveWorkflowState = async () => ({ success: true });
  },
}));

describe("LinearService", () => {
  const service = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });

  describe("getIssue", () => {
    test("should return a mapped issue with scalar fields", async () => {
      const issue = await service.getIssue("issue-1");

      expect(issue.id).toBe("issue-1");
      expect(issue.title).toBe("Test Issue");
      expect(issue.description).toBe("Test description");
      expect(issue.priority).toBe(2);
      expect(issue.identifier).toBe("TEAM-1");
    });

    test("should map team and state from issue", async () => {
      const issue = await service.getIssue("issue-1");

      expect(issue.team).toEqual(mockTeam);
      expect(issue.state).toEqual({ id: "state-1", name: "In Progress", color: "#0000FF", type: "started" });
    });
  });

  describe("getIssues", () => {
    test("should return an array of mapped issues", async () => {
      const issues = await service.getIssues("team-1");

      expect(issues).toHaveLength(1);
      expect(issues[0]?.id).toBe("issue-1");
    });

    test("should accept filters parameter", async () => {
      const issues = await service.getIssues("team-1", { priority: { eq: 2 } });

      expect(issues).toHaveLength(1);
    });

    test("should return issues without explicit teamId", async () => {
      const issues = await service.getIssues();

      expect(issues).toHaveLength(1);
    });

    test("should use defaultTeamId from config when teamId is omitted", async () => {
      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key", teamId: "team-1" });
      const issues = await svc.getIssues();

      expect(issues).toHaveLength(1);
    });
  });

  describe("createIssue", () => {
    test("should return the created issue", async () => {
      const issue = await service.createIssue({
        title: "New Issue",
        team: { id: "team-1", name: "Engineering", key: "ENG" },
      });

      expect(issue.id).toBe("issue-1");
      expect(issue.title).toBe("Test Issue");
    });

    test("should throw when title is missing", async () => {
      expect(service.createIssue({ team: { id: "team-1", name: "Engineering", key: "ENG" } })).rejects.toBeInstanceOf(
        LinearException,
      );
    });

    test("should throw when team is missing", async () => {
      expect(service.createIssue({ title: "My Issue" })).rejects.toBeInstanceOf(LinearException);
    });

    test("should throw when issue creation returns no data", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          createIssue = async () => ({ issue: Promise.resolve(null) });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      expect(
        svc.createIssue({ title: "Issue", team: { id: "team-1", name: "Engineering", key: "ENG" } }),
      ).rejects.toBeInstanceOf(LinearException);
    });
  });

  describe("updateIssue", () => {
    test("should return the updated issue", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          updateIssue = async () => ({ issue: Promise.resolve(mockIssue) });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      const issue = await svc.updateIssue("issue-1", { title: "Updated Title" });

      expect(issue.id).toBe("issue-1");
    });

    test("should throw when issue update returns no data", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          updateIssue = async () => ({ issue: Promise.resolve(null) });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      expect(svc.updateIssue("issue-1", { title: "Updated" })).rejects.toBeInstanceOf(LinearException);
    });
  });

  describe("deleteIssue", () => {
    test("should return true on success", async () => {
      const result = await service.deleteIssue("issue-1");

      expect(result).toBe(true);
    });
  });

  describe("getTeams", () => {
    test("should return an array of teams", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          teams = async () => ({ nodes: [mockTeam] });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      const teams = await svc.getTeams();

      expect(teams).toHaveLength(1);
      expect(teams[0]).toEqual({ id: "team-1", name: "Engineering", key: "ENG" });
    });
  });

  describe("getProjects", () => {
    test("should return an array of projects without teamId filter", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          projects = async () => ({ nodes: [mockProject] });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      const projects = await svc.getProjects();

      expect(projects).toHaveLength(1);
      expect(projects[0]?.name).toBe("Q1 Roadmap");
    });

    test("should filter projects by teamId", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          projects = async () => ({ nodes: [mockProject] });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      const projects = await svc.getProjects("team-1");

      expect(projects).toHaveLength(1);
    });
  });

  describe("getViewer", () => {
    test("should return the authenticated user", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          get viewer() {
            return Promise.resolve(mockViewer);
          }
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      const viewer = await svc.getViewer();

      expect(viewer.id).toBe("user-1");
      expect(viewer.email).toBe("jane@example.com");
      expect(viewer.displayName).toBe("Jane");
    });
  });

  describe("getLabel", () => {
    test("should return a mapped label", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          issueLabel = async (_id: string) => mockLabel;
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      const label = await svc.getLabel("label-1");

      expect(label.id).toBe("label-1");
      expect(label.name).toBe("Bug");
      expect(label.color).toBe("#FF0000");
      expect(label.description).toBe("Bug label");
      expect(label.teamId).toBe("team-1");
    });

    test("should throw LinearException on SDK error", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          issueLabel = async () => {
            throw new Error("Not found");
          };
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      expect(svc.getLabel("bad-id")).rejects.toBeInstanceOf(LinearException);
    });
  });

  describe("getLabels", () => {
    test("should return an array of labels without teamId filter", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          issueLabels = async () => ({ nodes: [mockLabel] });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      const labels = await svc.getLabels();

      expect(labels).toHaveLength(1);
      expect(labels[0]?.name).toBe("Bug");
    });

    test("should filter labels by teamId", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          issueLabels = async () => ({ nodes: [mockLabel] });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      const labels = await svc.getLabels("team-1");

      expect(labels).toHaveLength(1);
    });

    test("should throw LinearException on SDK error", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          issueLabels = async () => {
            throw new Error("Network error");
          };
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      expect(svc.getLabels()).rejects.toBeInstanceOf(LinearException);
    });
  });

  describe("createLabel", () => {
    test("should return the created label", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          createIssueLabel = async () => ({ issueLabel: Promise.resolve(mockLabel) });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      const label = await svc.createLabel({ name: "Bug", color: "#FF0000", teamId: "team-1" });

      expect(label.id).toBe("label-1");
      expect(label.name).toBe("Bug");
      expect(label.color).toBe("#FF0000");
    });

    test("should throw when name is missing", async () => {
      expect(service.createLabel({ color: "#FF0000" })).rejects.toBeInstanceOf(LinearException);
    });

    test("should throw when label creation returns no data", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          createIssueLabel = async () => ({ issueLabel: Promise.resolve(null) });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      expect(svc.createLabel({ name: "Bug" })).rejects.toBeInstanceOf(LinearException);
    });
  });

  describe("updateLabel", () => {
    test("should return the updated label", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          updateIssueLabel = async () => ({ issueLabel: Promise.resolve(mockLabel) });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      const label = await svc.updateLabel("label-1", { name: "Feature" });

      expect(label.id).toBe("label-1");
    });

    test("should throw when label update returns no data", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          updateIssueLabel = async () => ({ issueLabel: Promise.resolve(null) });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      expect(svc.updateLabel("label-1", { name: "Feature" })).rejects.toBeInstanceOf(LinearException);
    });

    test("should throw LinearException on SDK error", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          updateIssueLabel = async () => {
            throw new Error("Network error");
          };
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      expect(svc.updateLabel("label-1", { name: "Bug" })).rejects.toBeInstanceOf(LinearException);
    });
  });

  describe("deleteLabel", () => {
    test("should return true on success", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          deleteIssueLabel = async () => ({ success: true });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      const result = await svc.deleteLabel("label-1");

      expect(result).toBe(true);
    });

    test("should throw LinearException on SDK error", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          deleteIssueLabel = async () => {
            throw new Error("Network error");
          };
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      expect(svc.deleteLabel("label-1")).rejects.toBeInstanceOf(LinearException);
    });
  });

  describe("getPriorities", () => {
    test("should return all 5 priority levels", () => {
      const priorities = service.getPriorities();

      expect(priorities).toHaveLength(5);
      expect(priorities[0]).toEqual({ value: 0, label: "No priority" });
      expect(priorities[4]).toEqual({ value: 4, label: "Low" });
    });
  });

  describe("getPriority", () => {
    test("should return the priority matching the issue priority value", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          issue = async () => ({ ...mockIssue, priority: 1 });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      const priority = await svc.getPriority("issue-1");

      expect(priority.value).toBe(1);
      expect(priority.label).toBe("Urgent");
    });

    test("should throw LinearException on SDK error", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          issue = async () => {
            throw new Error("Not found");
          };
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      expect(svc.getPriority("issue-1")).rejects.toBeInstanceOf(LinearException);
    });
  });

  describe("setPriority", () => {
    test("should return the updated issue", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          updateIssue = async () => ({ issue: Promise.resolve(mockIssue) });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      const issue = await svc.setPriority("issue-1", 3);

      expect(issue.id).toBe("issue-1");
    });

    test("should throw on invalid priority value", async () => {
      expect(service.setPriority("issue-1", 99)).rejects.toBeInstanceOf(LinearException);
    });

    test("should throw when update returns no data", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          updateIssue = async () => ({ issue: Promise.resolve(null) });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      expect(svc.setPriority("issue-1", 2)).rejects.toBeInstanceOf(LinearException);
    });
  });

  describe("clearPriority", () => {
    test("should set priority to 0 (No priority)", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          updateIssue = async (_id: string, input: { priority: number }) => {
            expect(input.priority).toBe(0);
            return { issue: Promise.resolve(mockIssue) };
          };
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      const issue = await svc.clearPriority("issue-1");

      expect(issue.id).toBe("issue-1");
    });
  });

  describe("getState", () => {
    test("should return a mapped state", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          workflowState = async (_id: string) => mockState;
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      const state = await svc.getState("state-1");

      expect(state.id).toBe("state-1");
      expect(state.name).toBe("In Progress");
      expect(state.color).toBe("#0000FF");
      expect(state.type).toBe("started");
      expect(state.description).toBe("Active work");
      expect(state.position).toBe(1);
      expect(state.teamId).toBe("team-1");
    });

    test("should throw LinearException on SDK error", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          workflowState = async () => {
            throw new Error("Not found");
          };
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      expect(svc.getState("bad-id")).rejects.toBeInstanceOf(LinearException);
    });
  });

  describe("getStates", () => {
    test("should return an array of states without teamId filter", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          workflowStates = async () => ({ nodes: [mockState] });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      const states = await svc.getStates();

      expect(states).toHaveLength(1);
      expect(states[0]?.name).toBe("In Progress");
    });

    test("should filter states by teamId", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          workflowStates = async () => ({ nodes: [mockState] });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      const states = await svc.getStates("team-1");

      expect(states).toHaveLength(1);
    });

    test("should throw LinearException on SDK error", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          workflowStates = async () => {
            throw new Error("Network error");
          };
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      expect(svc.getStates()).rejects.toBeInstanceOf(LinearException);
    });
  });

  describe("createState", () => {
    test("should return the created state", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          createWorkflowState = async () => ({ workflowState: Promise.resolve(mockState) });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      const state = await svc.createState({
        name: "In Progress",
        color: "#0000FF",
        type: "started",
        teamId: "team-1",
      });

      expect(state.id).toBe("state-1");
      expect(state.name).toBe("In Progress");
    });

    test("should throw when required fields are missing", async () => {
      expect(service.createState({ name: "In Progress" })).rejects.toBeInstanceOf(LinearException);
    });

    test("should throw when state creation returns no data", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          createWorkflowState = async () => ({ workflowState: Promise.resolve(null) });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      expect(
        svc.createState({ name: "In Progress", color: "#0000FF", type: "started", teamId: "team-1" }),
      ).rejects.toBeInstanceOf(LinearException);
    });
  });

  describe("updateState", () => {
    test("should return the updated state", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          updateWorkflowState = async () => ({ workflowState: Promise.resolve(mockState) });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      const state = await svc.updateState("state-1", { name: "Done" });

      expect(state.id).toBe("state-1");
    });

    test("should throw when update returns no data", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          updateWorkflowState = async () => ({ workflowState: Promise.resolve(null) });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      expect(svc.updateState("state-1", { name: "Done" })).rejects.toBeInstanceOf(LinearException);
    });

    test("should throw LinearException on SDK error", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          updateWorkflowState = async () => {
            throw new Error("Network error");
          };
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      expect(svc.updateState("state-1", { name: "Done" })).rejects.toBeInstanceOf(LinearException);
    });
  });

  describe("deleteState", () => {
    test("should return true on success", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          archiveWorkflowState = async () => ({ success: true });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      const result = await svc.deleteState("state-1");

      expect(result).toBe(true);
    });

    test("should throw LinearException on SDK error", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          archiveWorkflowState = async () => {
            throw new Error("Network error");
          };
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      expect(svc.deleteState("state-1")).rejects.toBeInstanceOf(LinearException);
    });
  });

  describe("checkLabelById", () => {
    test("should return true when label exists", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          issueLabel = async () => mockLabel;
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      expect(await svc.checkLabelById("label-1")).toBe(true);
    });

    test("should return false when SDK throws", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          issueLabel = async () => {
            throw new Error("Not found");
          };
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      expect(await svc.checkLabelById("bad-id")).toBe(false);
    });
  });

  describe("checkLabelByName", () => {
    test("should return true when label with matching name exists", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          issueLabels = async () => ({ nodes: [mockLabel] });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      expect(await svc.checkLabelByName("Bug")).toBe(true);
    });

    test("should return false when no label matches", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          issueLabels = async () => ({ nodes: [mockLabel] });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      expect(await svc.checkLabelByName("Unknown")).toBe(false);
    });

    test("should throw LinearException on SDK error", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          issueLabels = async () => {
            throw new Error("Network error");
          };
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      expect(svc.checkLabelByName("Bug")).rejects.toBeInstanceOf(LinearException);
    });
  });

  describe("checkPriorityById", () => {
    test("should return true for valid priority values", () => {
      expect(service.checkPriorityById(0)).toBe(true);
      expect(service.checkPriorityById(1)).toBe(true);
      expect(service.checkPriorityById(4)).toBe(true);
    });

    test("should return false for invalid priority values", () => {
      expect(service.checkPriorityById(5)).toBe(false);
      expect(service.checkPriorityById(-1)).toBe(false);
    });
  });

  describe("checkPriorityByName", () => {
    test("should return true for valid priority names", () => {
      expect(service.checkPriorityByName("Urgent")).toBe(true);
      expect(service.checkPriorityByName("High")).toBe(true);
      expect(service.checkPriorityByName("No priority")).toBe(true);
    });

    test("should return true case-insensitively", () => {
      expect(service.checkPriorityByName("urgent")).toBe(true);
      expect(service.checkPriorityByName("HIGH")).toBe(true);
    });

    test("should return false for unknown priority names", () => {
      expect(service.checkPriorityByName("Critical")).toBe(false);
      expect(service.checkPriorityByName("")).toBe(false);
    });
  });

  describe("checkStateById", () => {
    test("should return true when state exists", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          workflowState = async () => mockState;
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      expect(await svc.checkStateById("state-1")).toBe(true);
    });

    test("should return false when SDK throws", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          workflowState = async () => {
            throw new Error("Not found");
          };
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      expect(await svc.checkStateById("bad-id")).toBe(false);
    });
  });

  describe("checkStateByName", () => {
    test("should return true when state with matching name exists", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          workflowStates = async () => ({ nodes: [mockState] });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      expect(await svc.checkStateByName("In Progress")).toBe(true);
    });

    test("should return false when no state matches", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          workflowStates = async () => ({ nodes: [mockState] });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      expect(await svc.checkStateByName("Unknown")).toBe(false);
    });

    test("should throw LinearException on SDK error", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          workflowStates = async () => {
            throw new Error("Network error");
          };
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      expect(svc.checkStateByName("In Progress")).rejects.toBeInstanceOf(LinearException);
    });
  });

  describe("error handling", () => {
    test("getIssue should throw LinearException on SDK error", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          issue = async () => {
            throw new Error("Network error");
          };
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "bad-key" });
      expect(svc.getIssue("issue-1")).rejects.toBeInstanceOf(LinearException);
    });

    test("getIssues should throw LinearException on SDK error", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          issues = async () => {
            throw new Error("Network error");
          };
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "bad-key" });
      expect(svc.getIssues("team-1")).rejects.toBeInstanceOf(LinearException);
    });

    test("deleteIssue should throw LinearException on SDK error", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          deleteIssue = async () => {
            throw new Error("Network error");
          };
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "bad-key" });
      expect(svc.deleteIssue("issue-1")).rejects.toBeInstanceOf(LinearException);
    });

    test("getTeams should throw LinearException on SDK error", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          teams = async () => {
            throw new Error("Network error");
          };
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "bad-key" });
      expect(svc.getTeams()).rejects.toBeInstanceOf(LinearException);
    });

    test("getProjects should throw LinearException on SDK error", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          projects = async () => {
            throw new Error("Network error");
          };
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "bad-key" });
      expect(svc.getProjects()).rejects.toBeInstanceOf(LinearException);
    });

    test("getViewer should throw LinearException on SDK error", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          get viewer() {
            return Promise.reject(new Error("Unauthorized"));
          }
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "bad-key" });
      expect(svc.getViewer()).rejects.toBeInstanceOf(LinearException);
    });
  });

  describe("constructor", () => {
    test("should throw LinearException when no API key is provided", () => {
      expect(() => new LinearService({} as unknown as AppEnv, {})).toThrow(LinearException);
    });

    test("should throw LinearException when config is omitted and AppEnv has no key", () => {
      expect(() => new LinearService({} as unknown as AppEnv)).toThrow(LinearException);
    });

    test("should not throw when apiKey is provided in config", () => {
      expect(() => new LinearService({} as unknown as AppEnv, { apiKey: "valid-key" })).not.toThrow();
    });

    test("should not throw when teamId is provided in config", () => {
      expect(() => new LinearService({} as unknown as AppEnv, { apiKey: "valid-key", teamId: "team-1" })).not.toThrow();
    });

    test("should use teamId from env via AppEnv as defaultTeamId", () => {
      const mockEnv = { LINEAR_API_KEY: "valid-key", LINEAR_TEAM_ID: "env-team-1" } as unknown as AppEnv;
      expect(() => new LinearService(mockEnv)).not.toThrow();
    });
  });

  describe("createComment", () => {
    const mockCommentUser = { id: "user-1", name: "Jane Doe", email: "jane@example.com", displayName: "Jane" };
    const mockCommentData = {
      id: "comment-1",
      body: "Test comment",
      createdAt: new Date("2024-01-01"),
      user: Promise.resolve(mockCommentUser),
    };

    test("should return comment with user", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          createComment = async () => ({ comment: Promise.resolve(mockCommentData) });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      const comment = await svc.createComment("issue-1", "Test comment");

      expect(comment.id).toBe("comment-1");
      expect(comment.body).toBe("Test comment");
      expect(comment.createdAt).toEqual(new Date("2024-01-01"));
      expect(comment.user?.id).toBe("user-1");
      expect(comment.user?.name).toBe("Jane Doe");
      expect(comment.user?.email).toBe("jane@example.com");
      expect(comment.user?.displayName).toBe("Jane");
    });

    test("should return comment without user when user resolves null", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          createComment = async () => ({
            comment: Promise.resolve({ ...mockCommentData, user: Promise.resolve(null) }),
          });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      const comment = await svc.createComment("issue-1", "Anonymous comment");

      expect(comment.id).toBe("comment-1");
      expect(comment.user).toBeUndefined();
    });

    test("should throw LinearException when comment creation returns no data", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          createComment = async () => ({ comment: Promise.resolve(null) });
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      expect(svc.createComment("issue-1", "body")).rejects.toBeInstanceOf(LinearException);
    });

    test("should throw LinearException on SDK error", async () => {
      mock.module("@linear/sdk", () => ({
        LinearClient: class {
          createComment = async () => {
            throw new Error("Network error");
          };
        },
      }));

      const svc = new LinearService({} as unknown as AppEnv, { apiKey: "test-key" });
      expect(svc.createComment("issue-1", "body")).rejects.toBeInstanceOf(LinearException);
    });
  });
});
