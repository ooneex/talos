import { inject } from "@talosjs/container";
import { LinearService } from "@talosjs/linear";
import { Assert, type AssertType } from "@talosjs/validation";
import { decorator } from "../decorators";
import type { ITool } from "../types";

/** Arguments the model supplies when deleting a Linear issue. */
export type LinearIssueDeleteInputType = {
  /** Identifier of the issue to delete. Required. */
  id: string;
};

/** Outcome of a delete call, echoed back so the model can confirm. */
export type LinearIssueDeleteResultType = {
  id: string;
  deleted: boolean;
};

/**
 * Function-calling tool that deletes a Linear issue.
 *
 * The model supplies the issue `id`; the tool delegates to
 * {@link LinearService.deleteIssue} and reports whether the deletion succeeded.
 *
 * @example
 * ```ts
 * @decorator.chat()
 * class TriageChat extends Chat {
 *   public getModel = () => "anthropic/claude-sonnet-4.5";
 *   public getSystemPrompts = () => ["You triage Linear issues."];
 *   public getTools = () => [LinearIssueDeleteTool];
 *   public getMiddlewares = () => [];
 * }
 * ```
 */
@decorator.tool()
export class LinearIssueDeleteTool implements ITool<unknown, Promise<LinearIssueDeleteResultType>> {
  public constructor(@inject(LinearService) private readonly linear: LinearService) {}

  public getName = (): string => "linear_issue_delete";

  public getDescription = (): string =>
    "Delete a Linear issue by its id. Returns whether the deletion succeeded. This is irreversible — only call it when the user has clearly asked to delete the issue.";

  public getInputSchema = (): AssertType => Assert({ id: "string > 0" });

  public handler = async (param: unknown): Promise<LinearIssueDeleteResultType> => {
    const { id } = param as LinearIssueDeleteInputType;

    const deleted = await this.linear.deleteIssue(id);

    return { id, deleted };
  };
}
