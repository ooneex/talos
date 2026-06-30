import { inject } from "@talosjs/container";
import {
  Issue,
  type LinearProjectType,
  LinearService,
  type LinearTeamType,
  type LinearUserType,
} from "@talosjs/linear";
import { Assert, type AssertType } from "@talosjs/validation";
import { decorator } from "../decorators";
import type { ITool } from "../types";
import { type LinearIssueResultType, toIssueResult } from "./utils";

/** Arguments the model supplies when creating a Linear issue. */
export type LinearIssueCreateInputType = {
  /** Issue title. Required. */
  title: string;
  /** Team the issue belongs to. Required — Linear has no default on creation. */
  teamId: string;
  /** Markdown body describing the issue. */
  description?: string;
  /** User the issue is assigned to. */
  assigneeId?: string;
  /** Project the issue is filed under. */
  projectId?: string;
  /** Priority: 0 (none), 1 (urgent), 2 (high), 3 (normal), 4 (low). */
  priority?: number;
  /** Workflow state (column) to place the issue in. */
  stateId?: string;
  /** Labels to attach to the issue. */
  labelIds?: string[];
};

/**
 * Function-calling tool that creates a Linear issue.
 *
 * The model supplies at least a `title` and `teamId`; optional fields
 * (description, assignee, project, priority, state, labels) are forwarded only
 * when present. The tool delegates to {@link LinearService.createIssue} and
 * returns the same trimmed-down projection as {@link LinearSearchTool} so the
 * model can confirm what was created.
 *
 * @example
 * ```ts
 * @decorator.chat()
 * class TriageChat extends Chat {
 *   public getModel = () => "anthropic/claude-sonnet-4.5";
 *   public getSystemPrompts = () => ["You file Linear issues."];
 *   public getTools = () => [LinearIssueCreateTool];
 *   public getMiddlewares = () => [];
 * }
 * ```
 */
@decorator.tool()
export class LinearIssueCreateTool implements ITool<unknown, Promise<LinearIssueResultType>> {
  public constructor(@inject(LinearService) private readonly linear: LinearService) {}

  public getName = (): string => "linear_issue_create";

  public getDescription = (): string =>
    "Create a new Linear issue. Requires a title and a teamId; optionally accepts a description, assignee, project, priority (0=none, 1=urgent, 2=high, 3=normal, 4=low), workflow state, and labels. Returns the created issue.";

  public getInputSchema = (): AssertType =>
    Assert({
      title: "string > 0",
      teamId: "string > 0",
      "description?": "string",
      "assigneeId?": "string",
      "projectId?": "string",
      "priority?": "0 <= number <= 4",
      "stateId?": "string",
      "labelIds?": "string[]",
    });

  public handler = async (param: unknown): Promise<LinearIssueResultType> => {
    const { title, teamId, description, assigneeId, projectId, priority, stateId, labelIds } =
      param as LinearIssueCreateInputType;

    const issue = new Issue();
    issue.title = title;
    // `createIssue` only reads the `.id` of these relations; the surrounding
    // shape is required by the type but unused, so a minimal id-only cast is safe.
    issue.team = { id: teamId } as LinearTeamType;
    if (description != null) issue.description = description;
    if (priority != null) issue.priority = priority;
    if (assigneeId != null) issue.assignee = { id: assigneeId } as LinearUserType;
    if (projectId != null) issue.project = { id: projectId } as LinearProjectType;
    if (stateId != null) issue.state = { id: stateId };
    if (labelIds != null) issue.labels = labelIds.map((id) => ({ id }));

    const created = await this.linear.createIssue(issue);

    return toIssueResult(created);
  };
}
