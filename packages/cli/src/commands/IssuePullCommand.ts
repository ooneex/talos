import { Buffer } from "node:buffer";
import { join } from "node:path";
import { AppEnv } from "@talosjs/app-env";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { type Issue, LinearService } from "@talosjs/linear";
import { TerminalLogger } from "@talosjs/logger";
import { prompt } from "enquirer";
import { readCredentials } from "../credentials";
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
      provider === "jira"
        ? await pullJiraIssue(id, issuesDir, module, logger)
        : await pullLinearIssue(id, issuesDir, module, logger);

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

const pullLinearIssue = async (
  id: string,
  issuesDir: string,
  module: string,
  logger: TerminalLogger,
): Promise<PulledIssue | null> => {
  const credentials = await readCredentials("linear.yml");
  const apiKey = credentials?.token;
  if (!apiKey) {
    logger.error("No Linear credentials found. Run `talos linear:credentials:create`", undefined, LOG_OPTIONS);
    return null;
  }

  const service = new LinearService(new AppEnv(), { apiKey });
  const issue = await service.getIssue(id);

  return {
    yaml: linearIssueToYaml(issue, module),
    identifier: issue.identifier ?? (await generateIssueId(issuesDir)),
  };
};

const priorityName = (priority: number | undefined): string | undefined => {
  const names: Record<number, string> = { 0: "No priority", 1: "Urgent", 2: "High", 3: "Medium", 4: "Low" };
  return priority !== undefined ? (names[priority] ?? String(priority)) : undefined;
};

// Structured fields extracted from a pushed description (see IssuePushCommand.buildDescription).
type ParsedDescription = {
  module?: string | undefined;
  context?: string | undefined;
  goal?: string | undefined;
  dod?: string | undefined;
  dependencies?: string[] | undefined;
};

// Map a level-2 heading title to the structured field it starts. Unknown headings
// (e.g. `## Technical Notes` nested inside `goal`) stay as content of the current section.
const sectionKey = (title: string): Exclude<keyof ParsedDescription, "module"> | null => {
  switch (title.trim().toLowerCase()) {
    case "context":
      return "context";
    case "goal":
      return "goal";
    case "definition of done":
      return "dod";
    case "dependencies":
      return "dependencies";
    default:
      return null;
  }
};

// Reverse of IssuePushCommand.buildDescription: split a description back into its
// `**Module:**` line and `## Context` / `## Goal` / `## Definition of Done` / `## Dependencies` sections.
const parseDescription = (description: string | null | undefined): ParsedDescription => {
  if (!description) return {};

  const result: ParsedDescription = {};
  const sections = new Map<Exclude<keyof ParsedDescription, "module">, string[]>();
  const preamble: string[] = [];
  let current: Exclude<keyof ParsedDescription, "module"> | null = null;

  for (const line of description.split("\n")) {
    const moduleMatch = line.match(/^\*\*Module:\*\*\s*`([^`]+)`\s*$/);
    if (moduleMatch?.[1] && result.module === undefined) {
      result.module = moduleMatch[1];
      continue;
    }

    const headingMatch = line.match(/^##\s+(.+?)\s*$/);
    const key = headingMatch?.[1] ? sectionKey(headingMatch[1]) : null;
    if (key) {
      current = key;
      if (!sections.has(key)) sections.set(key, []);
      continue;
    }

    (current ? (sections.get(current) as string[]) : preamble).push(line);
  }

  const trimBlock = (lines: string[] | undefined): string | undefined => {
    const text = (lines ?? []).join("\n").trim();
    return text.length > 0 ? text : undefined;
  };

  // Leading text before any recognized heading falls back to `context`.
  result.context = trimBlock(sections.get("context") ?? preamble);
  result.goal = trimBlock(sections.get("goal"));
  result.dod = trimBlock(sections.get("dod"));

  const depsSection = sections.get("dependencies");
  if (depsSection) {
    const deps = depsSection.map((line) => line.replace(/^\s*-\s*/, "").trim()).filter((line) => line.length > 0);
    if (deps.length > 0) result.dependencies = deps;
  }

  return result;
};

const linearIssueToYaml = (issue: Issue, module: string): string => {
  const parsed = parseDescription(issue.description);
  return issueToYaml({
    id: issue.identifier,
    module: parsed.module ?? module,
    title: issue.title,
    state: issue.state?.name,
    priority: priorityName(issue.priority),
    labels: issue.labels && issue.labels.length > 0 ? issue.labels.map((label) => label.name ?? "") : undefined,
    context: parsed.context,
    goal: parsed.goal,
    dod: parsed.dod,
    dependencies: parsed.dependencies,
    comments:
      issue.comments && issue.comments.length > 0
        ? issue.comments.map((comment) => ({ author: comment.user?.name ?? null, message: comment.body ?? "" }))
        : undefined,
  });
};

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

const pullJiraIssue = async (
  id: string,
  issuesDir: string,
  module: string,
  logger: TerminalLogger,
): Promise<PulledIssue | null> => {
  const credentials = await readCredentials("jira.yml");
  const baseUrl = credentials?.baseUrl;
  const email = credentials?.email;
  const apiToken = credentials?.token;

  if (!baseUrl || !email || !apiToken) {
    logger.error("No Jira credentials found. Run `talos jira:credentials:create`", undefined, LOG_OPTIONS);
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
    yaml: jiraIssueToYaml(issue, module),
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

const jiraIssueToYaml = (issue: JiraIssue, module: string): string => {
  const fields = issue.fields ?? {};
  const comments = fields.comment?.comments ?? [];
  const parsed = parseDescription(adfToText(fields.description));

  return issueToYaml({
    id: issue.key,
    module: parsed.module ?? module,
    title: fields.summary,
    state: fields.status?.name,
    priority: fields.priority?.name,
    labels: fields.labels && fields.labels.length > 0 ? fields.labels : undefined,
    context: parsed.context,
    goal: parsed.goal,
    dod: parsed.dod,
    dependencies: parsed.dependencies,
    comments:
      comments.length > 0
        ? comments.map((comment) => ({
            author: comment.author?.displayName ?? null,
            message: adfToText(comment.body) ?? "",
          }))
        : undefined,
  });
};
