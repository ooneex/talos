import type { Issue as LinearSDKIssue } from "@linear/sdk";
import type {
  LinearCommentType,
  LinearLabelType,
  LinearProjectType,
  LinearStateType,
  LinearTeamType,
  LinearUserType,
} from "./types";

export class Issue {
  public id?: string;
  public title?: string;
  public description?: string;
  public priority?: number;
  public url?: string;
  public identifier?: string;
  public createdAt?: Date;
  public updatedAt?: Date;
  public team?: LinearTeamType;
  public assignee?: LinearUserType;
  public project?: LinearProjectType;
  public state?: LinearStateType;
  public labels?: LinearLabelType[];
  public comments?: LinearCommentType[];
}

export const mapIssue = async (raw: LinearSDKIssue): Promise<Issue> => {
  const issue = new Issue();
  issue.id = raw.id;
  issue.title = raw.title;
  if (raw.description != null) issue.description = raw.description;
  issue.priority = raw.priority;
  issue.url = raw.url;
  issue.identifier = raw.identifier;
  issue.createdAt = raw.createdAt;
  issue.updatedAt = raw.updatedAt;

  const [team, state, assignee, project, labels, comments] = await Promise.all([
    raw.team ?? Promise.resolve(undefined),
    raw.state ?? Promise.resolve(undefined),
    raw.assignee ?? Promise.resolve(undefined),
    raw.project ?? Promise.resolve(undefined),
    raw.labels(),
    raw.comments(),
  ]);

  if (team) issue.team = { id: team.id, name: team.name, key: team.key };
  if (state) issue.state = { id: state.id, name: state.name, color: state.color, type: state.type };
  if (assignee)
    issue.assignee = { id: assignee.id, name: assignee.name, email: assignee.email, displayName: assignee.displayName };
  if (project)
    issue.project = {
      id: project.id,
      name: project.name,
      description: project.description ?? undefined,
      url: project.url,
    };
  issue.labels = labels.nodes.map((l) => ({ id: l.id, name: l.name, color: l.color }));
  issue.comments = await Promise.all(
    comments.nodes.map(async (c) => {
      const user = await c.user;
      return {
        id: c.id,
        body: c.body,
        createdAt: c.createdAt,
        ...(user ? { user: { id: user.id, name: user.name, email: user.email, displayName: user.displayName } } : {}),
      };
    }),
  );

  return issue;
};
