import { inject } from "@talosjs/container";
import { LinearService } from "@talosjs/linear";
import { Assert, type AssertType } from "@talosjs/validation";
import { decorator } from "../decorators";
import type { ITool } from "../types";
import { type LinearIssueResultType, toIssueResult } from "./utils";

/** Arguments the model supplies when calling the Linear search tool. */
export type LinearSearchInputType = {
  /** Free-text query matched against issue titles and descriptions. */
  query: string;
  /** Restrict the search to a single team; falls back to the service default team. */
  teamId?: string;
  /** Maximum number of issues to return. Defaults to {@link DEFAULT_LIMIT}. */
  limit?: number;
};

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/**
 * Function-calling tool that searches Linear issues by free text.
 *
 * The model supplies a `query` (and optionally a `teamId` / `limit`); the tool
 * builds a case-insensitive title/description filter, delegates to
 * {@link LinearService.getIssues}, and returns a trimmed-down projection of each
 * matching issue so the model isn't handed the full Linear payload.
 *
 * @example
 * ```ts
 * @decorator.chat()
 * class TriageChat extends Chat {
 *   public getModel = () => "anthropic/claude-sonnet-4.5";
 *   public getSystemPrompts = () => ["You triage Linear issues."];
 *   public getTools = () => [LinearSearchTool];
 *   public getMiddlewares = () => [];
 * }
 * ```
 */
@decorator.tool()
export class LinearSearchTool implements ITool<unknown, Promise<LinearIssueResultType[]>> {
  public constructor(@inject(LinearService) private readonly linear: LinearService) {}

  public getName = (): string => "linear_search";

  public getDescription = (): string =>
    "Search Linear issues by free text. Matches the query against issue titles and descriptions and returns the most relevant issues with their identifier, title, status, assignee, and labels.";

  public getInputSchema = (): AssertType =>
    Assert({
      query: "string > 0",
      "teamId?": "string",
      "limit?": "number > 0",
    });

  // `param` is validated against `getInputSchema` by the chat runtime before it
  // reaches here, so the narrowing cast is safe.
  public handler = async (param: unknown): Promise<LinearIssueResultType[]> => {
    const { query, teamId, limit } = param as LinearSearchInputType;
    const max = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const filter = {
      or: [{ title: { containsIgnoreCase: query } }, { description: { containsIgnoreCase: query } }],
    };

    const issues = await this.linear.getIssues(teamId, filter);

    return issues.slice(0, max).map(toIssueResult);
  };
}
