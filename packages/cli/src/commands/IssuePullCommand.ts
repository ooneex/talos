import { join } from "node:path";
import { AppEnv } from "@talosjs/app-env";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { type Issue, LinearService } from "@talosjs/linear";
import { TerminalLogger } from "@talosjs/logger";
import { readCredentials } from "../credentials";
import { prompt } from "../prompts/prompt";
import { ensureModule, generateIssueId, issueToYaml, LOG_OPTIONS } from "../utils";

type CommandOptionsType = {
  id?: string;
  module?: string;
};

type PulledIssue = { yaml: string; identifier: string };

@decorator.command()
export class IssuePullCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "issue:pull";
  }

  public getDescription(): string {
    return "Pull an issue from Linear and save it as a YAML file";
  }

  public async run(options: T): Promise<void> {
    let { id } = options;
    const module = options.module?.trim() || "shared";

    const logger = new TerminalLogger();

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

    const pulled = await pullLinearIssue(id, issuesDir, module, logger);

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
