import { Buffer } from "node:buffer";
import { join } from "node:path";
import { AppEnv } from "@talosjs/app-env";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { type Issue, LinearService } from "@talosjs/linear";
import { TerminalLogger } from "@talosjs/logger";
import { prompt } from "enquirer";
import { ensureModule, generateIssueId, issueToYaml, LOG_OPTIONS } from "../utils";

type ProviderType = "linear" | "jira";

type CommandOptionsType = {
  id?: string;
  module?: string;
  provider?: ProviderType;
};

const PROVIDERS: ProviderType[] = ["linear", "jira"];

type PulledIssue = { yaml: string; identifier: string };

@decorator.command()
export class IssuePullCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "issue:pull";
  }

  public getDescription(): string {
    return "Pull an issue from Linear or Jira and save it as a YAML file";
  }

  public async run(options: T): Promise<void> {
    let { id } = options;
    const { module = "shared", provider = "linear" } = options;

    const logger = new TerminalLogger();

    if (!PROVIDERS.includes(provider)) {
      logger.error(`Unknown provider "${provider}". Expected one of: ${PROVIDERS.join(", ")}`, undefined, LOG_OPTIONS);
      process.exitCode = 1;
      return;
    }

    const base = join("modules", module);
    const issuesLocalDir = join(base, "issues");
    const issuesDir = join(process.cwd(), issuesLocalDir);

    if (!id) {
      const response = await prompt<{ id: string }>({
        type: "input",
        name: "id",
        message: "Enter issue ID",
        initial: await generateIssueId(issuesDir),
        validate: (value: string) => value.trim().length > 0 || "Issue ID is required",
      });
      id = response.id.trim();
    }

    await ensureModule(module);

    const pulled =
      provider === "jira" ? await pullJiraIssue(id, issuesDir, logger) : await pullLinearIssue(id, issuesDir, logger);

    if (!pulled) {
      process.exitCode = 1;
      return;
    }

    const fileName = `${pulled.identifier}.yml`;
    const filePath = join(issuesDir, fileName);
    const fileExists = await Bun.file(filePath).exists();
    await Bun.write(filePath, pulled.yaml);

    const action = fileExists ? "updated" : "created";
    logger.success(`${join(issuesLocalDir, fileName)} ${action} successfully`, undefined, LOG_OPTIONS);
  }
}

const pullLinearIssue = async (id: string, issuesDir: string, logger: TerminalLogger): Promise<PulledIssue | null> => {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    logger.error("LINEAR_API_KEY environment variable is required", undefined, LOG_OPTIONS);
    return null;
  }

  const service = new LinearService(new AppEnv(), { apiKey });
  const issue = await service.getIssue(id);

  return {
    yaml: linearIssueToYaml(issue),
    identifier: issue.identifier ?? (await generateIssueId(issuesDir)),
  };
};

const priorityName = (priority: number | undefined): string | undefined => {
  const names: Record<number, string> = { 0: "No priority", 1: "Urgent", 2: "High", 3: "Medium", 4: "Low" };
  return priority !== undefined ? (names[priority] ?? String(priority)) : undefined;
};

const linearIssueToYaml = (issue: Issue): string =>
  issueToYaml({
    id: issue.identifier,
    title: issue.title,
    state: issue.state?.name,
    priority: priorityName(issue.priority),
    description: issue.description,
    labels: issue.labels && issue.labels.length > 0 ? issue.labels.map((label) => label.name ?? "") : undefined,
    comments:
      issue.comments && issue.comments.length > 0
        ? issue.comments.map((comment) => ({ author: comment.user?.name ?? null, message: comment.body ?? "" }))
        : undefined,
  });

// Minimal shape of the Jira Cloud REST v3 issue payload consumed here.
type JiraAdfNode = { text?: string; content?: JiraAdfNode[] };
type JiraAdfDoc = { content?: JiraAdfNode[] };
type JiraComment = { author?: { displayName?: string }; body?: JiraAdfDoc };
type JiraIssue = {
  key?: string;
  fields?: {
    summary?: string;
    status?: { name?: string };
    priority?: { name?: string };
    description?: JiraAdfDoc | null;
    labels?: string[];
    comment?: { comments?: JiraComment[] };
  };
};

const pullJiraIssue = async (id: string, issuesDir: string, logger: TerminalLogger): Promise<PulledIssue | null> => {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !apiToken) {
    logger.error(
      "JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN environment variables are required",
      undefined,
      LOG_OPTIONS,
    );
    return null;
  }

  const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");
  const fields = "summary,status,priority,description,labels,comment";
  const url = `${baseUrl.replace(/\/+$/, "")}/rest/api/3/issue/${encodeURIComponent(id)}?fields=${fields}`;

  const response = await fetch(url, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });

  if (!response.ok) {
    logger.error(`Failed to fetch Jira issue ${id} (HTTP ${response.status})`, undefined, LOG_OPTIONS);
    return null;
  }

  const issue = (await response.json()) as JiraIssue;

  return {
    yaml: jiraIssueToYaml(issue),
    identifier: issue.key ?? (await generateIssueId(issuesDir)),
  };
};

// Flatten the inline text of an ADF node tree into a plain string.
const extractAdfInline = (nodes: JiraAdfNode[] | undefined): string =>
  (nodes ?? []).map((node) => (typeof node.text === "string" ? node.text : extractAdfInline(node.content))).join("");

// Render an Atlassian Document Format document as newline-separated block text.
const adfToText = (doc: JiraAdfDoc | null | undefined): string | undefined => {
  if (!doc || !Array.isArray(doc.content)) return undefined;
  const text = doc.content
    .map((block) => extractAdfInline(block.content))
    .join("\n")
    .trim();
  return text.length > 0 ? text : undefined;
};

const jiraIssueToYaml = (issue: JiraIssue): string => {
  const fields = issue.fields ?? {};
  const comments = fields.comment?.comments ?? [];

  return issueToYaml({
    id: issue.key,
    title: fields.summary,
    state: fields.status?.name,
    priority: fields.priority?.name,
    description: adfToText(fields.description),
    labels: fields.labels && fields.labels.length > 0 ? fields.labels : undefined,
    comments:
      comments.length > 0
        ? comments.map((comment) => ({
            author: comment.author?.displayName ?? null,
            message: adfToText(comment.body) ?? "",
          }))
        : undefined,
  });
};
