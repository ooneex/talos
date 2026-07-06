import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { AppEnv } from "@talosjs/app-env";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { Issue, LinearService } from "@talosjs/linear";
import { TerminalLogger } from "@talosjs/logger";
import { YAML } from "bun";
import { prompt } from "enquirer";
import { readCredentials } from "../credentials";
import { createSpinner, LOG_OPTIONS } from "../utils";

type CommandOptionsType = {
  id?: string;
  module?: string;
};

type ParsedIssue = {
  id?: string | undefined;
  title?: string | undefined;
  state?: string | undefined;
  priority?: string | undefined;
  description?: string | undefined;
  labels: string[];
  comments: { author: string | null; message: string }[];
};

const PRIORITY_MAP: Record<string, number> = {
  "no priority": 0,
  urgent: 1,
  high: 2,
  medium: 3,
  normal: 3,
  low: 4,
};

const toScalar = (value: unknown): string | undefined => (value == null ? undefined : String(value));

const parseIssueYaml = (content: string): ParsedIssue => {
  const data = (YAML.parse(content) ?? {}) as Record<string, unknown>;

  const labels = Array.isArray(data.labels) ? data.labels.filter((label) => label != null).map(String) : [];

  const comments = Array.isArray(data.comments)
    ? data.comments
        .filter((comment): comment is Record<string, unknown> => comment !== null && typeof comment === "object")
        .map((comment) => ({
          author: comment.author == null ? null : String(comment.author),
          message: comment.message == null ? "" : String(comment.message),
        }))
        .filter((comment) => comment.message)
    : [];

  const description = typeof data.description === "string" ? data.description.replace(/\n+$/, "") : undefined;

  return {
    id: toScalar(data.id),
    title: toScalar(data.title),
    state: toScalar(data.state),
    priority: toScalar(data.priority),
    description,
    labels,
    comments,
  };
};

@decorator.command()
export class IssuePushCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "issue:push";
  }

  public getDescription(): string {
    return "Push a local issue YAML to Linear (create or update)";
  }

  public async run(options: T): Promise<void> {
    let { id, module = "shared" } = options;

    if (!id) {
      const response = await prompt<{ id: string }>({
        type: "input",
        name: "id",
        message: "Enter issue ID",
        validate: (value: string) => value.trim().length > 0 || "Issue ID is required",
      });
      id = response.id.trim();
    }

    const logger = new TerminalLogger();
    const credentials = await readCredentials("linear.yml");
    const apiKey = credentials?.token;

    if (!apiKey) {
      logger.error("No Linear credentials found. Run `talos linear:credentials:create`", undefined, LOG_OPTIONS);
      process.exitCode = 1;
      return;
    }

    const issuesLocalDir = join("modules", module, "issues");
    const issuesDir = join(process.cwd(), issuesLocalDir);
    const filePath = join(issuesDir, `${id}.yml`);

    if (!(await Bun.file(filePath).exists())) {
      logger.error(`Issue file not found: ${join(issuesLocalDir, `${id}.yml`)}`, undefined, LOG_OPTIONS);
      process.exitCode = 1;
      return;
    }

    const content = await Bun.file(filePath).text();
    const parsed = parseIssueYaml(content);

    const service = new LinearService(new AppEnv(), { apiKey });

    let existingIssue: Issue | null = null;
    try {
      const fetchSpinner = createSpinner("Fetching issue from Linear...");
      existingIssue = await service.getIssue(parsed.id ?? id);
      fetchSpinner.stop();
    } catch {
      // Issue not in Linear yet
    }

    if (existingIssue) {
      await this.pushUpdate(service, existingIssue, parsed, logger);
    } else {
      await this.pushCreate(service, parsed, logger, issuesDir, id, filePath, content);
    }
  }

  private async pushUpdate(
    service: LinearService,
    existing: Issue,
    parsed: ParsedIssue,
    logger: TerminalLogger,
  ): Promise<void> {
    const issueId = existing.id;
    if (!issueId) return;

    const teamId = existing.team?.id;

    const stateId = parsed.state ? await this.resolveState(service, parsed.state, teamId, logger) : undefined;
    const labelIds = await this.resolveLabels(service, parsed.labels, teamId, logger);
    const priority = parsed.priority ? (PRIORITY_MAP[parsed.priority.toLowerCase()] ?? undefined) : undefined;

    const updateInput = new Issue();
    if (parsed.title != null) updateInput.title = parsed.title;
    if (parsed.description) updateInput.description = parsed.description;
    if (priority !== undefined) updateInput.priority = priority;
    if (stateId) updateInput.state = { id: stateId };
    updateInput.labels = labelIds.map((lid) => ({ id: lid }));
    const updateSpinner = createSpinner("Updating issue in Linear...");
    await service.updateIssue(issueId, updateInput);
    updateSpinner.stop();

    logger.success(`Issue ${existing.identifier} updated in Linear`, undefined, LOG_OPTIONS);

    await this.syncComments(service, issueId, existing, parsed.comments, logger);
  }

  private async pushCreate(
    service: LinearService,
    parsed: ParsedIssue,
    logger: TerminalLogger,
    issuesDir: string,
    localId: string,
    filePath: string,
    content: string,
  ): Promise<void> {
    if (!parsed.title) {
      logger.error("Issue title is required to create in Linear", undefined, LOG_OPTIONS);
      process.exitCode = 1;
      return;
    }

    const teamsSpinner = createSpinner("Fetching teams from Linear...");
    const teams = await service.getTeams();
    teamsSpinner.stop();
    if (teams.length === 0) {
      logger.error("No teams found in Linear", undefined, LOG_OPTIONS);
      process.exitCode = 1;
      return;
    }

    const { teamKey } = await prompt<{ teamKey: string }>({
      type: "select",
      name: "teamKey",
      message: "Select target team",
      choices: teams.map((t) => ({ name: t.key, message: `${t.name} (${t.key})` })),
    } as Parameters<typeof prompt>[0]);
    const team = teams.find((t) => t.key === teamKey);

    if (!team) return;

    const stateId = parsed.state ? await this.resolveState(service, parsed.state, team.id, logger) : undefined;
    const labelIds = await this.resolveLabels(service, parsed.labels, team.id, logger);
    const priority = parsed.priority ? (PRIORITY_MAP[parsed.priority.toLowerCase()] ?? undefined) : undefined;

    const createInput = new Issue();
    createInput.title = parsed.title;
    createInput.team = team;
    if (parsed.description) createInput.description = parsed.description;
    if (priority !== undefined) createInput.priority = priority;
    if (stateId) createInput.state = { id: stateId };
    if (labelIds.length > 0) createInput.labels = labelIds.map((lid) => ({ id: lid }));
    const createIssueSpinner = createSpinner("Creating issue in Linear...");
    const created = await service.createIssue(createInput);
    createIssueSpinner.stop();

    logger.success(`Issue ${created.identifier} created in Linear`, undefined, LOG_OPTIONS);

    for (const comment of parsed.comments) {
      if (comment.message.trim() && created.id) {
        const commentSpinner = createSpinner("Adding comment...");
        await service.createComment(created.id, comment.message);
        commentSpinner.stop();
      }
    }

    if (created.identifier && created.identifier !== localId) {
      const newFileName = `${created.identifier}.yml`;
      const newFilePath = join(issuesDir, newFileName);
      const newContent = content.replace(/^id:\s*.+$/m, `id: ${JSON.stringify(created.identifier)}`);
      await Bun.write(newFilePath, newContent);
      await unlink(filePath);
      logger.success(`Local file renamed to ${newFileName}`, undefined, LOG_OPTIONS);
    }
  }

  private async resolveState(
    service: LinearService,
    stateName: string,
    teamId: string | undefined,
    logger: TerminalLogger,
  ): Promise<string | undefined> {
    const statesSpinner = createSpinner("Fetching states from Linear...");
    const states = await service.getStates(teamId);
    statesSpinner.stop();
    const found = states.find((s) => s.name?.toLowerCase() === stateName.toLowerCase());
    if (found?.id) return found.id;

    const { shouldCreate } = await prompt<{ shouldCreate: boolean }>({
      type: "confirm",
      name: "shouldCreate",
      message: `State "${stateName}" not found in Linear. Create it?`,
      initial: false,
    });

    if (!shouldCreate || !teamId) return undefined;

    const { color } = await prompt<{ color: string }>({
      type: "input",
      name: "color",
      message: "State color (hex)",
      initial: "#6366f1",
    });

    const { type } = await prompt<{ type: string }>({
      type: "select",
      name: "type",
      message: "State type",
      choices: ["backlog", "unstarted", "started", "completed", "cancelled"],
    } as Parameters<typeof prompt>[0]);

    const stateCreateSpinner = createSpinner(`Creating state "${stateName}"...`);
    const created = await service.createState({ name: stateName, color, type, teamId });
    stateCreateSpinner.stop();
    logger.success(`State "${stateName}" created in Linear`, undefined, LOG_OPTIONS);
    return created.id;
  }

  private async resolveLabels(
    service: LinearService,
    labelNames: string[],
    teamId: string | undefined,
    logger: TerminalLogger,
  ): Promise<string[]> {
    if (labelNames.length === 0) return [];

    const labelsSpinner = createSpinner("Fetching labels from Linear...");
    const existing = await service.getLabels();
    labelsSpinner.stop();
    const ids: string[] = [];

    for (const name of labelNames) {
      const found = existing.find((l) => l.name?.toLowerCase() === name.toLowerCase());
      if (found?.id) {
        ids.push(found.id);
        continue;
      }
      const labelCreateSpinner = createSpinner(`Creating label "${name}"...`);
      const created = await service.createLabel({ name, ...(teamId ? { teamId } : {}) });
      labelCreateSpinner.stop();
      if (created.id) {
        ids.push(created.id);
        logger.success(`Label "${name}" created in Linear`, undefined, LOG_OPTIONS);
      }
    }

    return ids;
  }

  private async syncComments(
    service: LinearService,
    issueId: string,
    existing: Issue,
    newComments: { author: string | null; message: string }[],
    logger: TerminalLogger,
  ): Promise<void> {
    if (newComments.length === 0) return;

    const existingBodies = new Set((existing.comments ?? []).map((c) => c.body));

    for (const comment of newComments) {
      if (comment.message.trim() && !existingBodies.has(comment.message)) {
        const syncCommentSpinner = createSpinner("Adding comment...");
        await service.createComment(issueId, comment.message);
        syncCommentSpinner.stop();
        logger.success("Comment added to issue", undefined, LOG_OPTIONS);
      }
    }
  }
}
