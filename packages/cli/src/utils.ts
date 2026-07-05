import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TerminalLogger } from "@talosjs/logger";
import { ModuleCreateCommand } from "./commands/ModuleCreateCommand";

export const LOG_OPTIONS = { showTimestamp: false, showArrow: false, useSymbol: true } as const;
export const LOG_OPTIONS_PLAIN = { showTimestamp: false, showArrow: false, useSymbol: false } as const;

export const CLI_PACKAGE_NAME = "@talosjs/cli";

/**
 * Resolve the installed version of the CLI by walking up from this module's
 * directory until the `@talosjs/cli` package.json is found. Walking up (rather
 * than importing package.json) keeps the same code working both when run from
 * source (`src/commands`) and when bundled into `dist/index.js`. Returns
 * `"unknown"` when the package.json cannot be located.
 */
export const getCliVersion = async (): Promise<string> => {
  let dir = import.meta.dir;

  while (true) {
    const packageJsonFile = Bun.file(join(dir, "package.json"));

    if (await packageJsonFile.exists()) {
      const packageJson = await packageJsonFile.json();
      if (packageJson.name === CLI_PACKAGE_NAME && typeof packageJson.version === "string") {
        return packageJson.version;
      }
    }

    const parent = dirname(dir);
    if (parent === dir) return "unknown";
    dir = parent;
  }
};

export type CiProviderType = "github" | "gitlab" | "bitbucket";

/**
 * Infer which CI/CD provider a project already uses from the files scaffolded by
 * {@link AppCreateCommand}, so new microservices can add pipelines for the same
 * provider. Returns null when none is configured.
 */
export const detectCiProvider = (cwd: string): CiProviderType | null => {
  if (existsSync(join(cwd, ".github", "workflows"))) return "github";
  if (existsSync(join(cwd, ".gitlab-ci.yml")) || existsSync(join(cwd, ".gitlab", "ci"))) return "gitlab";
  if (existsSync(join(cwd, "bitbucket-pipelines.yml"))) return "bitbucket";
  return null;
};

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

/** Braille spinner frames shared by {@link createSpinner} and the monorepo runner's live footer. */
export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

export const createSpinner = (message: string): { stop: () => void } => {
  if (!process.stdout.isTTY) return { stop: () => {} };
  let i = 0;
  const id = setInterval(() => {
    process.stdout.write(`\r${SPINNER_FRAMES[i % SPINNER_FRAMES.length]} ${message}`);
    i++;
  }, 80);
  return {
    stop: () => {
      clearInterval(id);
      process.stdout.write("\r\x1b[K");
    },
  };
};

/**
 * Read a module's package.json name, returning null when the module has no
 * package.json (used by the app:* commands to detect a missing app module).
 */
export const loadAppModuleName = async (appDir: string, fallback = "app"): Promise<string | null> => {
  const packageJsonFile = Bun.file(join(appDir, "package.json"));
  if (!(await packageJsonFile.exists())) return null;
  const packageJson = await packageJsonFile.json();
  return packageJson.name ?? fallback;
};

/**
 * Run a child process to completion while a spinner shows progress instead of
 * streaming the child's logs. The child's stdout/stderr are captured and, on
 * failure, surfaced as the error details so the user sees what went wrong.
 * Reports success/failure through the logger, sets `process.exitCode` to 1 on
 * failure and returns whether the process exited cleanly.
 *
 * Pass `silent` to suppress the spinner and success message (the failure log is
 * always emitted); pass `env` to extend the child's environment.
 */
export const spawnStep = async (
  logger: TerminalLogger,
  args: string[],
  cwd: string,
  messages: { start?: string; success?: string; failure: (exitCode: number) => string },
  options?: { silent?: boolean | undefined; env?: Record<string, string> | undefined },
): Promise<boolean> => {
  const spinner = !options?.silent && messages.start ? createSpinner(messages.start) : null;

  let stdout = "";
  let stderr = "";
  let exitCode: number;

  try {
    const proc = Bun.spawn(args, {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      ...(options?.env ? { env: { ...process.env, ...options.env } } : {}),
    });

    // Drain both pipes concurrently with the exit to avoid deadlocking on large output.
    [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
  } catch (error) {
    // Bun.spawn throws synchronously when the binary cannot be launched.
    spinner?.stop();
    const reason = error instanceof Error ? error.message : String(error);
    logger.error(messages.failure(1), { message: reason }, LOG_OPTIONS);
    process.exitCode = 1;
    return false;
  }

  spinner?.stop();

  if (exitCode === 0) {
    if (!options?.silent && messages.success) logger.success(messages.success, undefined, LOG_OPTIONS);
    return true;
  }

  const details = [stdout, stderr]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n");
  logger.error(messages.failure(exitCode), details ? { message: details } : undefined, LOG_OPTIONS);
  process.exitCode = 1;
  return false;
};

export type RunModuleScriptsOptions = {
  binPath: string[];
  label: string;
  drop?: boolean | undefined;
  env?: string | undefined;
  version?: string | undefined;
  /**
   * Forward the `--no-cache` flag to the module script so it bypasses its own
   * run cache. Caching is the script's concern (e.g. `migration:up` caches per
   * migration version); the runner only relays the opt-out.
   */
  noCache?: boolean | undefined;
};

export const runModuleScripts = async (
  logger: TerminalLogger,
  { binPath, label, drop, env, version, noCache }: RunModuleScriptsOptions,
): Promise<void> => {
  const titledLabel = `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
  const rootDir = process.cwd();
  const modulesDir = join(rootDir, "modules");

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
    const args = ["bun", "run", join(dir, ...binPath)];
    if (drop) {
      args.push("--drop");
    }
    // Not the CLI's own `-v`/`--version` flag: this is `migration:down`'s target
    // version, forwarded to each module's `bin/migration/down.ts` so it rolls
    // back that specific migration (it falls back to the latest when omitted).
    if (version) {
      args.push("--version", version);
    }
    if (noCache) {
      args.push("--no-cache");
    }

    const succeeded = await spawnStep(
      logger,
      args,
      dir,
      {
        start: `Running ${label} for ${name}...`,
        success: `${titledLabel} completed for ${name}`,
        failure: (exitCode) => `${titledLabel} failed for ${name} (exit code: ${exitCode})`,
      },
      env ? { env: { APP_ENV: env } } : undefined,
    );

    // A failed run must abort the whole command so the failure is not masked.
    if (!succeeded) {
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
  module?: string | null | undefined;
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
  if (issue.module !== undefined) lines.push(`module: ${quoteScalar(issue.module)}`);
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
