import { inject } from "@talosjs/container";
import {
  Issue,
  type LinearProjectType,
  LinearService,
  type LinearUserType,
} from "@talosjs/linear";
import { Assert, type AssertType } from "@talosjs/validation";
import { decorator } from "../decorators";
import type { ITool } from "../types";
import { type LinearIssueResultType, toIssueResult } from "./utils";

/** Arguments the model supplies when updating a Linear issue. */
export type LinearIssueUpdateInputType = {
  /** Identifier of the issue to update. Required. */
  id: string;
  /** New title. */
  title?: string;
  /** New markdown body. */
  description?: string;
  /** Reassign the issue to this user. */
  assigneeId?: string;
  /** Move the issue under this project. */
  projectId?: string;
  /** Priority: 0 (none), 1 (urgent), 2 (high), 3 (normal), 4 (low). */
  priority?: number;
  /** Move the issue to this workflow state (column). */
  stateId?: string;
  /** Replace the issue's labels with these. */
  labelIds?: string[];
};

/**
 * Function-calling tool that updates an existing Linear issue.
 *
 * The model supplies the issue `id` plus any fields to change; only the fields
 * present in the call are forwarded, so omitted fields are left untouched. The
 * tool delegates to {@link LinearService.updateIssue} and returns the same
 * trimmed-down projection as the other Linear tools so the model can confirm the
 * result.
 *
 * @example
 * ```ts
 * @decorator.chat()
 * class TriageChat extends Chat {
 *   public getModel = () => "anthropic/claude-sonnet-4.5";
 *   public getSystemPrompts = () => ["You triage Linear issues."];
 *   public getTools = () => [LinearIssueUpdateTool];
 *   public getMiddlewares = () => [];
 * }
 * ```
 */
@decorator.tool()
export class LinearIssueUpdateTool implements ITool<unknown, Promise<LinearIssueResultType>> {
  public constructor(@inject(LinearService) private readonly linear: LinearService) {}

  public getName = (): string => "linear_issue_update";

  public getDescription = (): string =>
    "Update an existing Linear issue. Requires the issue id; optionally changes the title, description, assignee, project, priority (0=none, 1=urgent, 2=high, 3=normal, 4=low), workflow state, or labels. Only the provided fields are changed. Returns the updated issue.";

  public getInputSchema = (): AssertType =>
    Assert({
      id: "string > 0",
      "title?": "string > 0",
      "description?": "string",
      "assigneeId?": "string",
      "projectId?": "string",
      "priority?": "0 <= number <= 4",
      "stateId?": "string",
      "labelIds?": "string[]",
    });

  public handler = async (param: unknown): Promise<LinearIssueResultType> => {
    const { id, title, description, assigneeId, projectId, priority, stateId, labelIds } =
      param as LinearIssueUpdateInputType;

    const issue = new Issue();
    // `updateIssue` only forwards the fields that are set, and only reads the
    // `.id` of these relations; the surrounding shape is required by the type
    // but unused, so a minimal id-only cast is safe.
    if (title != null) issue.title = title;
    if (description != null) issue.description = description;
    if (priority != null) issue.priority = priority;
    if (assigneeId != null) issue.assignee = { id: assigneeId } as LinearUserType;
    if (projectId != null) issue.project = { id: projectId } as LinearProjectType;
    if (stateId != null) issue.state = { id: stateId };
    if (labelIds != null) issue.labels = labelIds.map((labelId) => ({ id: labelId }));

    const updated = await this.linear.updateIssue(id, issue);

    return toIssueResult(updated);
  };
}
