import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { ensureModule, generateIssueId, issueToYaml, LOG_OPTIONS } from "../utils";

type CommandOptionsType = {
  title?: string;
  state?: string;
  priority?: string;
  description?: string;
  labels?: string[];
  module?: string;
};

@decorator.command()
export class IssueCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "issue:create";
  }

  public getDescription(): string {
    return "Create a YAML skeleton file for a new issue";
  }

  public async run(options: T): Promise<void> {
    const { module = "shared" } = options;
    const { title, state, priority, description, labels = [] } = options;

    await ensureModule(module);

    const base = join("modules", module);
    const issuesLocalDir = join(base, "issues");
    const issuesDir = join(process.cwd(), issuesLocalDir);
    const resolvedId = await generateIssueId(issuesDir);
    const yaml = issueToYaml({
      id: resolvedId,
      module,
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
