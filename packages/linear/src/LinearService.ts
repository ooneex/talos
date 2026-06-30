import { LinearClient } from "@linear/sdk";
import { AppEnv } from "@talosjs/app-env";
import { inject, injectable } from "@talosjs/container";
import { type Issue, mapIssue } from "./Issue";
import { LinearException } from "./LinearException";
import type {
  ILinearService,
  LinearCommentType,
  LinearConfigType,
  LinearLabelType,
  LinearPriorityType,
  LinearProjectType,
  LinearStateType,
  LinearTeamType,
  LinearUserType,
} from "./types";

const PRIORITIES: LinearPriorityType[] = [
  { value: 0, label: "No priority" },
  { value: 1, label: "Urgent" },
  { value: 2, label: "High" },
  { value: 3, label: "Normal" },
  { value: 4, label: "Low" },
];

@injectable()
export class LinearService implements ILinearService {
  private readonly client: LinearClient;
  private readonly defaultTeamId: string | undefined;

  public constructor(
    @inject(AppEnv) private readonly env: AppEnv,
    config: LinearConfigType = {},
  ) {
    const apiKey = config.apiKey || this.env.LINEAR_API_KEY;

    if (!apiKey) {
      throw new LinearException(
        "Linear API key is required. Please provide it through the constructor config or set the LINEAR_API_KEY environment variable.",
        "API_KEY_REQUIRED",
        {},
      );
    }

    this.client = new LinearClient({ apiKey });
    this.defaultTeamId = config.teamId || this.env.LINEAR_TEAM_ID;
  }

  public async getIssue(id: string): Promise<Issue> {
    try {
      const issue = await this.client.issue(id);
      return mapIssue(issue);
    } catch (e) {
      throw new LinearException(`Failed to fetch issue: ${id}`, "ISSUE_FETCH_ERROR", { id, cause: String(e) });
    }
  }

  public async getIssues(teamId?: string, filters: Record<string, unknown> = {}): Promise<Issue[]> {
    const resolvedTeamId = teamId ?? this.defaultTeamId;
    try {
      const issues = await this.client.issues(
        resolvedTeamId ? { filter: { team: { id: { eq: resolvedTeamId } }, ...filters } } : { filter: filters },
      );
      return Promise.all(issues.nodes.map(mapIssue));
    } catch (e) {
      throw new LinearException(`Failed to fetch issues for team: ${resolvedTeamId}`, "ISSUES_FETCH_ERROR", {
        teamId: resolvedTeamId,
        cause: String(e),
      });
    }
  }

  public async createIssue(input: Issue): Promise<Issue> {
    try {
      if (!input.title || !input.team) {
        throw new LinearException("title and team are required", "ISSUE_CREATE_ERROR", {});
      }
      const payload = await this.client.createIssue({
        title: input.title,
        teamId: input.team.id,
        ...(input.description != null ? { description: input.description } : {}),
        ...(input.assignee != null ? { assigneeId: input.assignee.id } : {}),
        ...(input.project != null ? { projectId: input.project.id } : {}),
        ...(input.priority != null ? { priority: input.priority } : {}),
        ...(input.state != null ? { stateId: input.state.id } : {}),
        ...(input.labels != null ? { labelIds: input.labels.flatMap((l) => (l.id != null ? [l.id] : [])) } : {}),
      });

      const issue = await payload.issue;
      if (!issue) {
        throw new LinearException("Issue creation returned no data", "ISSUE_CREATE_ERROR", {
          input: JSON.stringify(input),
        });
      }
      return mapIssue(issue);
    } catch (e) {
      if (e instanceof LinearException) throw e;
      throw new LinearException("Failed to create issue", "ISSUE_CREATE_ERROR", {
        input: JSON.stringify(input),
        cause: String(e),
      });
    }
  }

  public async updateIssue(id: string, input: Issue): Promise<Issue> {
    try {
      const payload = await this.client.updateIssue(id, {
        ...(input.title != null ? { title: input.title } : {}),
        ...(input.description != null ? { description: input.description } : {}),
        ...(input.assignee != null ? { assigneeId: input.assignee.id } : {}),
        ...(input.project != null ? { projectId: input.project.id } : {}),
        ...(input.priority != null ? { priority: input.priority } : {}),
        ...(input.state != null ? { stateId: input.state.id } : {}),
        ...(input.labels != null ? { labelIds: input.labels.flatMap((l) => (l.id != null ? [l.id] : [])) } : {}),
      });

      const issue = await payload.issue;
      if (!issue) {
        throw new LinearException("Issue update returned no data", "ISSUE_UPDATE_ERROR", { id });
      }
      return mapIssue(issue);
    } catch (e) {
      if (e instanceof LinearException) throw e;
      throw new LinearException(`Failed to update issue: ${id}`, "ISSUE_UPDATE_ERROR", { id, cause: String(e) });
    }
  }

  public async deleteIssue(id: string): Promise<boolean> {
    try {
      const payload = await this.client.deleteIssue(id);
      return payload.success;
    } catch (e) {
      throw new LinearException(`Failed to delete issue: ${id}`, "ISSUE_DELETE_ERROR", { id, cause: String(e) });
    }
  }

  public async getTeams(): Promise<LinearTeamType[]> {
    try {
      const teams = await this.client.teams();
      return teams.nodes.map((team) => ({
        id: team.id,
        name: team.name,
        key: team.key,
      }));
    } catch (e) {
      throw new LinearException("Failed to fetch teams", "TEAMS_FETCH_ERROR", { cause: String(e) });
    }
  }

  public async getProjects(teamId?: string): Promise<LinearProjectType[]> {
    const resolvedTeamId = teamId ?? this.defaultTeamId;
    try {
      const projects = await this.client.projects(
        resolvedTeamId ? { filter: { accessibleTeams: { id: { eq: resolvedTeamId } } } } : {},
      );

      return projects.nodes.map((project) => ({
        id: project.id,
        name: project.name,
        ...(project.description != null ? { description: project.description } : {}),
        url: project.url,
      }));
    } catch (e) {
      throw new LinearException("Failed to fetch projects", "PROJECTS_FETCH_ERROR", {
        teamId: resolvedTeamId,
        cause: String(e),
      });
    }
  }

  public async getViewer(): Promise<LinearUserType> {
    try {
      const viewer = await this.client.viewer;
      return {
        id: viewer.id,
        name: viewer.name,
        email: viewer.email,
        displayName: viewer.displayName,
      };
    } catch (e) {
      throw new LinearException("Failed to fetch viewer", "VIEWER_FETCH_ERROR", { cause: String(e) });
    }
  }

  public async getLabel(id: string): Promise<LinearLabelType> {
    try {
      const label = await this.client.issueLabel(id);
      return {
        id: label.id,
        name: label.name,
        color: label.color,
        ...(label.description != null ? { description: label.description } : {}),
        ...(label.teamId != null ? { teamId: label.teamId } : {}),
      };
    } catch (e) {
      throw new LinearException(`Failed to fetch label: ${id}`, "LABEL_FETCH_ERROR", { id, cause: String(e) });
    }
  }

  public async getLabels(teamId?: string): Promise<LinearLabelType[]> {
    const resolvedTeamId = teamId ?? this.defaultTeamId;
    try {
      const labels = await this.client.issueLabels(
        resolvedTeamId ? { filter: { team: { id: { eq: resolvedTeamId } } } } : {},
      );
      return labels.nodes.map((label) => ({
        id: label.id,
        name: label.name,
        color: label.color,
        ...(label.description != null ? { description: label.description } : {}),
        ...(label.teamId != null ? { teamId: label.teamId } : {}),
      }));
    } catch (e) {
      throw new LinearException("Failed to fetch labels", "LABELS_FETCH_ERROR", {
        teamId: resolvedTeamId,
        cause: String(e),
      });
    }
  }

  public async createLabel(input: LinearLabelType): Promise<LinearLabelType> {
    const resolvedTeamId = input.teamId ?? this.defaultTeamId;
    try {
      if (!input.name) {
        throw new LinearException("name is required", "LABEL_CREATE_ERROR", {});
      }
      const payload = await this.client.createIssueLabel({
        name: input.name,
        ...(input.color != null ? { color: input.color } : {}),
        ...(input.description != null ? { description: input.description } : {}),
        ...(resolvedTeamId != null ? { teamId: resolvedTeamId } : {}),
      });
      const label = await payload.issueLabel;
      if (!label) {
        throw new LinearException("Label creation returned no data", "LABEL_CREATE_ERROR", {
          input: JSON.stringify(input),
        });
      }
      return {
        id: label.id,
        name: label.name,
        color: label.color,
        ...(label.description != null ? { description: label.description } : {}),
        ...(label.teamId != null ? { teamId: label.teamId } : {}),
      };
    } catch (e) {
      if (e instanceof LinearException) throw e;
      throw new LinearException("Failed to create label", "LABEL_CREATE_ERROR", {
        input: JSON.stringify(input),
        cause: String(e),
      });
    }
  }

  public async updateLabel(id: string, input: LinearLabelType): Promise<LinearLabelType> {
    try {
      const payload = await this.client.updateIssueLabel(id, {
        ...(input.name != null ? { name: input.name } : {}),
        ...(input.color != null ? { color: input.color } : {}),
        ...(input.description != null ? { description: input.description } : {}),
      });
      const label = await payload.issueLabel;
      if (!label) {
        throw new LinearException("Label update returned no data", "LABEL_UPDATE_ERROR", { id });
      }
      return {
        id: label.id,
        name: label.name,
        color: label.color,
        ...(label.description != null ? { description: label.description } : {}),
        ...(label.teamId != null ? { teamId: label.teamId } : {}),
      };
    } catch (e) {
      if (e instanceof LinearException) throw e;
      throw new LinearException(`Failed to update label: ${id}`, "LABEL_UPDATE_ERROR", { id, cause: String(e) });
    }
  }

  public async deleteLabel(id: string): Promise<boolean> {
    try {
      const payload = await this.client.deleteIssueLabel(id);
      return payload.success;
    } catch (e) {
      throw new LinearException(`Failed to delete label: ${id}`, "LABEL_DELETE_ERROR", { id, cause: String(e) });
    }
  }

  public getPriorities(): LinearPriorityType[] {
    return PRIORITIES;
  }

  public async getPriority(issueId: string): Promise<LinearPriorityType> {
    try {
      const issue = await this.client.issue(issueId);
      const priority = PRIORITIES.find((p) => p.value === issue.priority);
      if (!priority) {
        throw new LinearException(`Unknown priority value: ${issue.priority}`, "PRIORITY_FETCH_ERROR", { issueId });
      }
      return priority;
    } catch (e) {
      if (e instanceof LinearException) throw e;
      throw new LinearException(`Failed to fetch priority for issue: ${issueId}`, "PRIORITY_FETCH_ERROR", {
        issueId,
        cause: String(e),
      });
    }
  }

  public async setPriority(issueId: string, priority: number): Promise<Issue> {
    try {
      if (!PRIORITIES.some((p) => p.value === priority)) {
        throw new LinearException(`Invalid priority value: ${priority}`, "PRIORITY_SET_ERROR", { issueId, priority });
      }
      const payload = await this.client.updateIssue(issueId, { priority });
      const issue = await payload.issue;
      if (!issue) {
        throw new LinearException("Priority update returned no data", "PRIORITY_SET_ERROR", { issueId });
      }
      return mapIssue(issue);
    } catch (e) {
      if (e instanceof LinearException) throw e;
      throw new LinearException(`Failed to set priority for issue: ${issueId}`, "PRIORITY_SET_ERROR", {
        issueId,
        priority,
        cause: String(e),
      });
    }
  }

  public async clearPriority(issueId: string): Promise<Issue> {
    return this.setPriority(issueId, 0);
  }

  public async getState(id: string): Promise<LinearStateType> {
    try {
      const state = await this.client.workflowState(id);
      return {
        id: state.id,
        name: state.name,
        color: state.color,
        type: state.type,
        ...(state.description != null ? { description: state.description } : {}),
        position: state.position,
        ...(state.teamId != null ? { teamId: state.teamId } : {}),
      };
    } catch (e) {
      throw new LinearException(`Failed to fetch state: ${id}`, "STATE_FETCH_ERROR", { id, cause: String(e) });
    }
  }

  public async getStates(teamId?: string): Promise<LinearStateType[]> {
    const resolvedTeamId = teamId ?? this.defaultTeamId;
    try {
      const states = await this.client.workflowStates(
        resolvedTeamId ? { filter: { team: { id: { eq: resolvedTeamId } } } } : {},
      );
      return states.nodes.map((state) => ({
        id: state.id,
        name: state.name,
        color: state.color,
        type: state.type,
        ...(state.description != null ? { description: state.description } : {}),
        position: state.position,
        ...(state.teamId != null ? { teamId: state.teamId } : {}),
      }));
    } catch (e) {
      throw new LinearException("Failed to fetch states", "STATES_FETCH_ERROR", {
        teamId: resolvedTeamId,
        cause: String(e),
      });
    }
  }

  public async createState(input: LinearStateType): Promise<LinearStateType> {
    const resolvedTeamId = input.teamId ?? this.defaultTeamId;
    try {
      if (!input.name || !input.color || !input.type || !resolvedTeamId) {
        throw new LinearException("name, color, type and teamId are required", "STATE_CREATE_ERROR", {});
      }
      const payload = await this.client.createWorkflowState({
        name: input.name,
        color: input.color,
        type: input.type,
        teamId: resolvedTeamId,
        ...(input.description != null ? { description: input.description } : {}),
        ...(input.position != null ? { position: input.position } : {}),
      });
      const state = await payload.workflowState;
      if (!state) {
        throw new LinearException("State creation returned no data", "STATE_CREATE_ERROR", {
          input: JSON.stringify(input),
        });
      }
      return {
        id: state.id,
        name: state.name,
        color: state.color,
        type: state.type,
        ...(state.description != null ? { description: state.description } : {}),
        position: state.position,
        ...(state.teamId != null ? { teamId: state.teamId } : {}),
      };
    } catch (e) {
      if (e instanceof LinearException) throw e;
      throw new LinearException("Failed to create state", "STATE_CREATE_ERROR", {
        input: JSON.stringify(input),
        cause: String(e),
      });
    }
  }

  public async updateState(id: string, input: LinearStateType): Promise<LinearStateType> {
    try {
      const payload = await this.client.updateWorkflowState(id, {
        ...(input.name != null ? { name: input.name } : {}),
        ...(input.color != null ? { color: input.color } : {}),
        ...(input.description != null ? { description: input.description } : {}),
        ...(input.position != null ? { position: input.position } : {}),
      });
      const state = await payload.workflowState;
      if (!state) {
        throw new LinearException("State update returned no data", "STATE_UPDATE_ERROR", { id });
      }
      return {
        id: state.id,
        name: state.name,
        color: state.color,
        type: state.type,
        ...(state.description != null ? { description: state.description } : {}),
        position: state.position,
        ...(state.teamId != null ? { teamId: state.teamId } : {}),
      };
    } catch (e) {
      if (e instanceof LinearException) throw e;
      throw new LinearException(`Failed to update state: ${id}`, "STATE_UPDATE_ERROR", { id, cause: String(e) });
    }
  }

  public async deleteState(id: string): Promise<boolean> {
    try {
      const payload = await this.client.archiveWorkflowState(id);
      return payload.success;
    } catch (e) {
      throw new LinearException(`Failed to delete state: ${id}`, "STATE_DELETE_ERROR", { id, cause: String(e) });
    }
  }

  public async checkLabelById(id: string): Promise<boolean> {
    try {
      await this.client.issueLabel(id);
      return true;
    } catch {
      return false;
    }
  }

  public async checkLabelByName(name: string, teamId?: string): Promise<boolean> {
    const resolvedTeamId = teamId ?? this.defaultTeamId;
    try {
      const labels = await this.client.issueLabels(
        resolvedTeamId ? { filter: { team: { id: { eq: resolvedTeamId } } } } : {},
      );
      return labels.nodes.some((l) => l.name === name);
    } catch (e) {
      throw new LinearException("Failed to check label by name", "LABEL_CHECK_ERROR", {
        name,
        teamId: resolvedTeamId,
        cause: String(e),
      });
    }
  }

  public checkPriorityById(value: number): boolean {
    return PRIORITIES.some((p) => p.value === value);
  }

  public checkPriorityByName(name: string): boolean {
    return PRIORITIES.some((p) => p.label.toLowerCase() === name.toLowerCase());
  }

  public async checkStateById(id: string): Promise<boolean> {
    try {
      await this.client.workflowState(id);
      return true;
    } catch {
      return false;
    }
  }

  public async checkStateByName(name: string, teamId?: string): Promise<boolean> {
    const resolvedTeamId = teamId ?? this.defaultTeamId;
    try {
      const states = await this.client.workflowStates(
        resolvedTeamId ? { filter: { team: { id: { eq: resolvedTeamId } } } } : {},
      );
      return states.nodes.some((s) => s.name === name);
    } catch (e) {
      throw new LinearException("Failed to check state by name", "STATE_CHECK_ERROR", {
        name,
        teamId: resolvedTeamId,
        cause: String(e),
      });
    }
  }

  public async createComment(issueId: string, body: string): Promise<LinearCommentType> {
    try {
      const payload = await this.client.createComment({ issueId, body });
      const comment = await payload.comment;
      if (!comment) {
        throw new LinearException("Comment creation returned no data", "COMMENT_CREATE_ERROR", { issueId });
      }
      const user = await comment.user;
      return {
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt,
        ...(user ? { user: { id: user.id, name: user.name, email: user.email, displayName: user.displayName } } : {}),
      };
    } catch (e) {
      if (e instanceof LinearException) throw e;
      throw new LinearException(`Failed to create comment for issue: ${issueId}`, "COMMENT_CREATE_ERROR", {
        issueId,
        cause: String(e),
      });
    }
  }
}
