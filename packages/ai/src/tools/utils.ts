import type { Issue } from "@talosjs/linear";

/** Compact issue projection returned by the Linear tools — only model-useful fields. */
export type LinearIssueResultType = {
  id: string;
  identifier?: string;
  title?: string;
  description?: string;
  priority?: number;
  url?: string;
  state?: string;
  assignee?: string;
  team?: string;
  labels: string[];
};

/** Project a Linear {@link Issue} down to the fields surfaced to the model. */
export const toIssueResult = (issue: Issue): LinearIssueResultType => ({
  id: issue.id ?? "",
  ...(issue.identifier != null ? { identifier: issue.identifier } : {}),
  ...(issue.title != null ? { title: issue.title } : {}),
  ...(issue.description != null ? { description: issue.description } : {}),
  ...(issue.priority != null ? { priority: issue.priority } : {}),
  ...(issue.url != null ? { url: issue.url } : {}),
  ...(issue.state?.name != null ? { state: issue.state.name } : {}),
  ...(issue.assignee?.displayName != null ? { assignee: issue.assignee.displayName } : {}),
  ...(issue.team?.key != null ? { team: issue.team.key } : {}),
  labels: (issue.labels ?? []).flatMap((label) => (label.name != null ? [label.name] : [])),
});
