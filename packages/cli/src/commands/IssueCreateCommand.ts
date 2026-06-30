import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { prompt } from "enquirer";
import { ensureModule, generateIssueId, issueToYaml, LOG_OPTIONS } from "../utils";

type CommandOptionsType = {
  title?: string;
  state?: string;
  priority?: string;
  description?: string;
  labels?: string[];
  module?: string;
  interactive?: boolean;
};

const STATE_CHOICES = ["Backlog", "Todo", "Planned", "In Progress", "In Review", "Done", "Cancelled"];
const PRIORITY_CHOICES = ["Low", "Medium", "High", "Urgent"];

@decorator.command()
export class IssueCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "issue:create";
  }

  public getDescription(): string {
    return "Create a YAML skeleton file for a new issue";
  }

  public async run(options: T): Promise<void> {
    const { module = "shared", interactive } = options;
    let { title, state, priority, description, labels = [] } = options;

    await ensureModule(module);

    if (interactive) {
      const titleResponse = await prompt<{ title: string }>({
        type: "input",
        name: "title",
        message: "Issue title",
        initial: title,
        validate: (value: string) => value.trim().length > 0 || "Title is required",
      });
      title = titleResponse.title.trim();

      const stateIdx = STATE_CHOICES.indexOf(state ?? "");
      const stateResponse = await prompt<{ state: string }>({
        type: "select",
        name: "state",
        message: "State",
        choices: STATE_CHOICES,
        initial: stateIdx >= 0 ? stateIdx : STATE_CHOICES.indexOf("Todo"),
      } as Parameters<typeof prompt>[0]);
      state = stateResponse.state;

      const priorityIdx = PRIORITY_CHOICES.indexOf(priority ?? "");
      const priorityResponse = await prompt<{ priority: string }>({
        type: "select",
        name: "priority",
        message: "Priority",
        choices: PRIORITY_CHOICES,
        initial: priorityIdx >= 0 ? priorityIdx : PRIORITY_CHOICES.indexOf("Medium"),
      } as Parameters<typeof prompt>[0]);
      priority = priorityResponse.priority;

      const labelsResult = await prompt<{ labels: string[] }>({
        type: "list",
        name: "labels",
        message: "Labels (comma-separated, optional)",
      } as Parameters<typeof prompt>[0]);
      labels = (labelsResult.labels ?? []).map((l) => l.trim()).filter((l) => l.length > 0);

      const descriptionResponse = await prompt<{ description: string }>({
        type: "input",
        name: "description",
        message: "Description (optional)",
        initial: description,
      });
      description = descriptionResponse.description.trim() || undefined;
    }

    const base = join("modules", module);
    const issuesLocalDir = join(base, "issues");
    const issuesDir = join(process.cwd(), issuesLocalDir);
    const resolvedId = await generateIssueId(issuesDir);
    const yaml = issueToYaml({
      id: resolvedId,
      title: title?.trim() ?? null,
      state: state?.trim() ?? null,
      priority: priority?.trim() ?? null,
      description: description?.trim() ?? null,
      labels,
    });

    const fileName = `${resolvedId}.yml`;
    const filePath = join(issuesDir, fileName);
    await Bun.write(filePath, yaml);

    const logger = new TerminalLogger();
    logger.success(`${join(issuesLocalDir, fileName)} created successfully`, undefined, LOG_OPTIONS);
  }
}
