import { join } from "node:path";
import { AppEnv } from "@talosjs/app-env";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { type Issue, LinearService } from "@talosjs/linear";
import { TerminalLogger } from "@talosjs/logger";
import { prompt } from "enquirer";
import { ensureModule, generateIssueId, issueToYaml, LOG_OPTIONS } from "../utils";

type CommandOptionsType = {
  id?: string;
  module?: string;
};

@decorator.command()
export class IssuePullCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "issue:pull";
  }

  public getDescription(): string {
    return "Pull an issue from Linear and save it as a YAML file";
  }

  public async run(options: T): Promise<void> {
    let { id, module = "shared" } = options;

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

    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) {
      const logger = new TerminalLogger();
      logger.error("LINEAR_API_KEY environment variable is required", undefined, LOG_OPTIONS);
      process.exitCode = 1;
      return;
    }

    const service = new LinearService(new AppEnv(), { apiKey });
    const issue = await service.getIssue(id);

    const yaml = linearIssueToYaml(issue);

    const fileName = `${issue.identifier ?? (await generateIssueId(issuesDir))}.yml`;
    const filePath = join(issuesDir, fileName);
    const fileExists = await Bun.file(filePath).exists();
    await Bun.write(filePath, yaml);

    const logger = new TerminalLogger();
    const action = fileExists ? "updated" : "created";
    logger.success(`${join(issuesLocalDir, fileName)} ${action} successfully`, undefined, LOG_OPTIONS);
  }
}

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
