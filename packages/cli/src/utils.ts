import { existsSync } from "node:fs";
import { join } from "node:path";
import type { TerminalLogger } from "@talosjs/logger";
import { ModuleCreateCommand } from "./commands/ModuleCreateCommand";

export const LOG_OPTIONS = { showTimestamp: false, showArrow: false, useSymbol: true } as const;
export const LOG_OPTIONS_PLAIN = { showTimestamp: false, showArrow: false, useSymbol: false } as const;

const YAML_SCALAR_LOOKALIKE_REGEX = /^(true|false|null|yes|no|on|off|~|[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?)$/i;

const needsQuoting = (value: string): boolean =>
  /^[\s{[\]&*!|>'"%@`,?:-]/.test(value) ||
  /[\n#]/.test(value) ||
  value.includes(": ") ||
  value.endsWith(":") ||
  value !== value.trim() ||
  YAML_SCALAR_LOOKALIKE_REGEX.test(value);

/**
 * Build a map of dotted key paths to the comment lines that precede each key in
 * a YAML document, so the comments can be re-emitted by {@link toYaml}.
 */
export const extractYamlComments = (raw: string): Map<string, string[]> => {
  const comments = new Map<string, string[]>();
  const stack: { indent: number; key: string }[] = [];
  let pending: string[] = [];

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();

    if (trimmed === "") {
      pending = [];
      continue;
    }

    if (trimmed.startsWith("#")) {
      pending.push(trimmed);
      continue;
    }

    const keyMatch = /^([^:#\s][^:]*):(?:\s|$)/.exec(trimmed);
    if (!keyMatch) {
      pending = [];
      continue;
    }

    const indent = line.length - line.trimStart().length;
    while (stack.length > 0 && (stack.at(-1) as { indent: number }).indent >= indent) stack.pop();
    stack.push({ indent, key: (keyMatch[1] as string).trim() });

    if (pending.length > 0) {
      comments.set(stack.map((entry) => entry.key).join("."), pending);
      pending = [];
    }
  }

  return comments;
};

export const toYaml = (value: unknown, indent = 0, comments?: Map<string, string[]>, path = ""): string => {
  const pad = "  ".repeat(indent);

  if (value === null || value === undefined) return '""';

  if (typeof value === "string") {
    if (value === "" || needsQuoting(value)) return JSON.stringify(value);
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") return String(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return value.map((item) => `${pad}- ${toYaml(item, indent)}`).join("\n");
  }

  const entries = Object.entries(value as Record<string, unknown>).map(([k, v]) => {
    const keyPath = path ? `${path}.${k}` : k;
    const commentLines = comments?.get(keyPath);
    const prefix =
      commentLines && commentLines.length > 0 ? `${commentLines.map((line) => `${pad}${line}`).join("\n")}\n` : "";

    if (Array.isArray(v)) {
      if (v.length === 0) return `${prefix}${pad}${k}: []`;
      const childPad = "  ".repeat(indent + 1);
      return `${prefix}${pad}${k}:\n${v.map((item) => `${childPad}- ${toYaml(item, indent + 1)}`).join("\n")}`;
    }
    if (v !== null && v !== undefined && typeof v === "object") {
      return `${prefix}${pad}${k}:\n${toYaml(v, indent + 1, comments, keyPath)}`;
    }
    return `${prefix}${pad}${k}: ${toYaml(v, indent, comments, keyPath)}`;
  });

  // Match env.yml readability by separating top-level sections with a blank line.
  return entries.join(comments && indent === 0 ? "\n\n" : "\n");
};

export const createSpinner = (message: string): { stop: () => void } => {
  if (!process.stdout.isTTY) return { stop: () => {} };
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const id = setInterval(() => {
    process.stdout.write(`\r${frames[i % frames.length]} ${message}`);
    i++;
  }, 80);
  return {
    stop: () => {
      clearInterval(id);
      process.stdout.write("\r\x1b[K");
    },
  };
};

export type RunModuleScriptsOptions = {
  binPath: string[];
  label: string;
  drop?: boolean | undefined;
  env?: string | undefined;
  version?: string | undefined;
};

export const runModuleScripts = async (
  logger: TerminalLogger,
  { binPath, label, drop, env, version }: RunModuleScriptsOptions,
): Promise<void> => {
  const titledLabel = `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
  const modulesDir = join(process.cwd(), "modules");

  if (!existsSync(modulesDir)) {
    logger.warn(`No modules with ${label} found`, undefined, LOG_OPTIONS);
    return;
  }

  const glob = new Bun.Glob("*/package.json");
  const modules: { name: string; dir: string }[] = [];

  for await (const match of glob.scan({ cwd: modulesDir, onlyFiles: true })) {
    const entry = match.replace("/package.json", "");
    const moduleDir = join(modulesDir, entry);
    const scriptFile = Bun.file(join(moduleDir, ...binPath));

    if (await scriptFile.exists()) {
      const packageJson = await Bun.file(join(modulesDir, match)).json();
      modules.push({ name: packageJson.name ?? entry, dir: moduleDir });
    }
  }

  if (modules.length === 0) {
    logger.warn(`No modules with ${label} found`, undefined, LOG_OPTIONS);
    return;
  }

  for (const { name, dir } of modules) {
    logger.info(`Running ${label} for ${name}...`, undefined, LOG_OPTIONS);

    const args = ["bun", "run", join(dir, ...binPath)];
    if (drop) {
      args.push("--drop");
    }
    if (version) {
      args.push("--version", version);
    }

    try {
      Bun.spawn(args, {
        cwd: dir,
        stdout: "inherit",
        stderr: "inherit",
        env: env ? { ...process.env, APP_ENV: env } : process.env,
      });

      logger.success(`${titledLabel} completed for ${name}`, undefined, LOG_OPTIONS);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error), undefined, LOG_OPTIONS_PLAIN);
      logger.error(`${titledLabel} failed for ${name}`, undefined, LOG_OPTIONS);
      process.exit(1);
    }
  }
};

export const generateIssueId = async (issuesDir?: string): Promise<string> => {
  const letters = "ABCDEF";

  while (true) {
    const prefix = Array.from({ length: 3 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
    const number = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
    const id = `${prefix}-${number}`;

    if (!issuesDir || !(await Bun.file(join(issuesDir, `${id}.yml`)).exists())) {
      return id;
    }
  }
};

export type IssueYamlType = {
  id?: string | null | undefined;
  title?: string | null | undefined;
  state?: string | null | undefined;
  priority?: string | null | undefined;
  description?: string | null | undefined;
  labels?: string[] | undefined;
  comments?: { author: string | null; message: string }[] | undefined;
};

const quoteScalar = (value: string | null | undefined): string => (value == null ? "null" : JSON.stringify(value));

const yamlLiteral = (text: string): string => {
  const indented = text
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
  return `|\n${indented}`;
};

export const issueToYaml = (issue: IssueYamlType): string => {
  const lines: string[] = [];

  if (issue.id !== undefined) lines.push(`id: ${quoteScalar(issue.id)}`);
  if (issue.title !== undefined) lines.push(`title: ${quoteScalar(issue.title)}`);
  if (issue.state !== undefined) lines.push(`state: ${quoteScalar(issue.state)}`);
  if (issue.priority !== undefined) lines.push(`priority: ${quoteScalar(issue.priority)}`);

  if (issue.description !== undefined) {
    if (issue.description) {
      lines.push(`description: ${yamlLiteral(issue.description)}`);
    } else {
      lines.push("description: null");
    }
  }

  if (issue.labels !== undefined) {
    if (issue.labels.length > 0) {
      lines.push("labels:");
      for (const label of issue.labels) {
        lines.push(`  - ${quoteScalar(label)}`);
      }
    } else {
      lines.push("labels: []");
    }
  }

  if (issue.comments !== undefined && issue.comments.length > 0) {
    lines.push("comments:");
    for (const comment of issue.comments) {
      lines.push(`  - author: ${quoteScalar(comment.author)}`);
      lines.push(`    message: ${quoteScalar(comment.message)}`);
    }
  }

  return `${lines.join("\n")}\n`;
};

export const ensureModule = async (module: string): Promise<void> => {
  const moduleDir = join(process.cwd(), "modules", module);
  const moduleDirExists = await Bun.file(join(moduleDir, "package.json")).exists();

  if (!moduleDirExists) {
    const makeModule = new ModuleCreateCommand();
    await makeModule.run({ name: module, cwd: process.cwd(), silent: true });
  }
};
