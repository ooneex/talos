import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import {
  computeTaskHash,
  discoverTargets,
  hashRootInputs,
  isGitWorkspaceRoot,
  MONOREPO_CACHE_DIR,
  MONOREPO_CACHE_VERSION,
  type MonorepoTargetType,
  readCacheEntry,
  restoreCacheOutputs,
  sortTargetsByDependencies,
  writeCacheEntry,
} from "../monorepo";
import { bold, COLORS, colorize, formatDuration, MonorepoRunLogger, SYMBOLS } from "../monorepoRunLogger";
import { createSpinner } from "../utils";

type CommandOptionsType = {
  commands?: string;
  packages?: string;
  modules?: string;
  logs?: boolean;
  noCache?: boolean;
};

type TaskStatusType = "pending" | "running" | "success" | "cached" | "failed" | "skipped" | "aborted";

type TaskType = {
  /** Unique key, e.g. `packages/billing#build`. */
  key: string;
  /** Display label, e.g. `billing:build`. */
  label: string;
  /** The target this task runs a script for, or null for root-level tasks like `install`. */
  target: MonorepoTargetType | null;
  command: string;
  /** Directory the process is spawned in. */
  cwd: string;
  /** The process to run, e.g. `["bun", "run", "build"]` or `["bun", "install"]`. */
  argv: string[];
  /** Whether this task consults and writes the task cache. Root tasks are not cached. */
  cacheable: boolean;
  /** Keys of tasks in the same group that must finish first. */
  deps: string[];
  status: TaskStatusType;
  output: string;
  exitCode: number | null;
  durationMs: number;
  hash: string | null;
};

type RunContextType = {
  logger: MonorepoRunLogger;
  targets: MonorepoTargetType[];
  cacheDir: string;
  rootHash: string;
  fingerprints: Map<string, Promise<string>>;
  useGit: boolean;
  noCache: boolean;
  interactive: boolean;
  procs: Set<ReturnType<typeof Bun.spawn>>;
  stopped: boolean;
  aborted: boolean;
  failedTask: TaskType | null;
};

// `install` is not a per-target script: it runs `bun install` once at the project root.
const INSTALL_COMMAND = "install";

@decorator.command()
export class MonorepoRunCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "monorepo:run";
  }

  public getDescription(): string {
    return "Run package.json scripts across packages and modules with granular caching";
  }

  public async run(options: T): Promise<void> {
    const { commands, packages, modules, logs = false, noCache = false } = options;
    const logger = new MonorepoRunLogger();
    const fail = (message: string): void => {
      logger.persist(colorize(`${SYMBOLS.error} ${message}`, COLORS.error));
      process.exitCode = 1;
    };

    const commandList =
      typeof commands === "string"
        ? commands
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
        : [];

    if (commandList.length === 0) {
      fail("The --commands option is required (e.g. --commands=build,lint)");
      return;
    }

    const rootDir = process.cwd();

    // Discovering targets is the one visibly slow step before tasks start
    // streaming, so cover it with a spinner from utils. Stop it before any
    // other output so its in-place `\r` line never collides with a log line.
    const spinner = createSpinner("Analyzing workspace");
    // These three probes only depend on `rootDir` and never on each other, so
    // overlap them instead of paying for each round-trip in series.
    const [allTargets, rootHash, useGit] = await Promise.all([
      discoverTargets(rootDir),
      hashRootInputs(rootDir),
      isGitWorkspaceRoot(rootDir),
    ]);
    spinner.stop();

    const targets = this.filterTargets(allTargets, packages, modules, fail);
    if (!targets) return;
    // `install` needs no targets; only per-target commands do.
    if (targets.length === 0 && commandList.some((command) => command !== INSTALL_COMMAND)) {
      fail("No packages or modules found to run");
      return;
    }

    const sorted = sortTargetsByDependencies(targets);
    const includedKeys = new Set(sorted.map((target) => target.key));
    const groups = commandList.map((command) =>
      command === INSTALL_COMMAND ? this.buildInstallGroup(rootDir) : this.buildGroup(sorted, includedKeys, command),
    );

    const context: RunContextType = {
      logger,
      targets: allTargets,
      cacheDir: join(rootDir, MONOREPO_CACHE_DIR),
      rootHash,
      fingerprints: new Map(),
      useGit,
      noCache,
      interactive: !logs && process.stdout.isTTY === true && process.stdin.isTTY === true,
      procs: new Set(),
      stopped: false,
      aborted: false,
      failedTask: null,
    };

    const startedAt = performance.now();
    const allTasks = groups.flat();
    logger.persist(
      colorize(`${SYMBOLS.running} `, COLORS.accent) +
        colorize(bold(commandList.join(", ")), COLORS.accent) +
        colorize(
          `  ${allTasks.length} task${allTasks.length === 1 ? "" : "s"} across ${sorted.length} target${sorted.length === 1 ? "" : "s"}`,
          COLORS.dim,
        ),
    );
    const renderer = context.interactive ? this.startRenderer(allTasks, context) : null;

    try {
      for (const group of groups) {
        if (context.stopped) break;
        await this.runGroup(group, context);
      }
    } finally {
      renderer?.stop();
    }

    if (context.failedTask) {
      process.exitCode = 1;
      return;
    }
    if (context.aborted) {
      logger.persist(colorize(`${SYMBOLS.error} Aborted`, COLORS.error));
      process.exitCode = 1;
      return;
    }

    const completed = allTasks.filter((task) => task.status === "success").length;
    const cached = allTasks.filter((task) => task.status === "cached").length;
    const skipped = allTasks.filter((task) => task.status === "skipped").length;
    const parts = [`${completed} run`, `${cached} cached`];
    if (skipped > 0) parts.push(`${skipped} skipped`);
    logger.persist(
      colorize(`${SYMBOLS.success} `, COLORS.success) +
        colorize(`Ran ${commandList.join(", ")}`, COLORS.success) +
        colorize(`  ${parts.join(" · ")}  in ${formatDuration(Math.round(performance.now() - startedAt))}`, COLORS.dim),
    );
  }

  // Resolve `--packages` / `--modules` into targets. With neither flag, every
  // package and module runs. Unknown names abort the run.
  private filterTargets(
    targets: MonorepoTargetType[],
    packages: string | undefined,
    modules: string | undefined,
    fail: (message: string) => void,
  ): MonorepoTargetType[] | null {
    if (packages === undefined && modules === undefined) return targets;

    const wanted: { type: MonorepoTargetType["type"]; name: string }[] = [
      ...this.split(packages).map((name) => ({ type: "package" as const, name })),
      ...this.split(modules).map((name) => ({ type: "module" as const, name })),
    ];

    const selected: MonorepoTargetType[] = [];
    for (const { type, name } of wanted) {
      const target = targets.find((entry) => entry.type === type && entry.name === name);
      if (!target) {
        fail(`No ${type} named "${name}" found`);
        return null;
      }
      selected.push(target);
    }

    return selected;
  }

  private split(value?: string): string[] {
    if (!value) return [];
    return value
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
  }

  // One task per target for a command. Targets whose package.json lacks the
  // script are marked skipped up front; dependency edges only point at tasks
  // that are part of the run.
  private buildGroup(targets: MonorepoTargetType[], includedKeys: Set<string>, command: string): TaskType[] {
    return targets.map((target) => ({
      key: `${target.key}#${command}`,
      label: `${target.name}:${command}`,
      target,
      command,
      cwd: target.dir,
      argv: ["bun", "run", command],
      cacheable: true,
      deps: target.workspaceDeps.filter((key) => includedKeys.has(key)).map((key) => `${key}#${command}`),
      status: target.scripts[command] === undefined ? "skipped" : "pending",
      output: "",
      exitCode: null,
      durationMs: 0,
      hash: null,
    }));
  }

  // A single root-level `bun install`. It is not tied to a target and is never
  // cached, since bun already skips work when the lockfile is unchanged.
  private buildInstallGroup(rootDir: string): TaskType[] {
    return [
      {
        key: `root#${INSTALL_COMMAND}`,
        label: INSTALL_COMMAND,
        target: null,
        command: INSTALL_COMMAND,
        cwd: rootDir,
        argv: ["bun", "install"],
        cacheable: false,
        deps: [],
        status: "pending",
        output: "",
        exitCode: null,
        durationMs: 0,
        hash: null,
      },
    ];
  }

  // Run one command group's tasks one at a time, taking the next task whose
  // workspace dependencies are done. Skipped tasks count as done.
  private async runGroup(tasks: TaskType[], context: RunContextType): Promise<void> {
    const done = new Set<string>();
    for (const task of tasks.filter((entry) => entry.status === "skipped")) {
      done.add(task.key);
      this.reportFinish(task, context);
    }

    const queue = tasks.filter((task) => task.status === "pending");

    while (queue.length > 0 && !context.stopped) {
      let index = queue.findIndex((task) => task.deps.every((dep) => done.has(dep)));
      // Nothing ready means a dependency cycle: run the next task anyway.
      if (index === -1) index = 0;

      const task = queue.splice(index, 1)[0] as TaskType;
      await this.runTask(task, context);
      done.add(task.key);
    }
  }

  private async runTask(task: TaskType, context: RunContextType): Promise<void> {
    task.status = "running";
    const startedAt = performance.now();

    if (task.cacheable && task.target && !context.noCache) {
      try {
        task.hash = await computeTaskHash(
          task.target,
          task.command,
          context.targets,
          context.rootHash,
          context.fingerprints,
          context.useGit,
        );
        const entry = await readCacheEntry(context.cacheDir, task.hash);
        if (entry) {
          await restoreCacheOutputs(context.cacheDir, entry.meta, task.target.dir);
          task.output = entry.output;
          task.durationMs = Math.round(performance.now() - startedAt);
          task.status = "cached";
          this.reportFinish(task, context);
          return;
        }
      } catch {
        // Hashing or cache reads must never break the run; fall through and execute.
        task.hash = null;
      }
    }

    if (context.stopped) {
      task.status = "aborted";
      this.reportFinish(task, context);
      return;
    }

    let proc: ReturnType<typeof Bun.spawn>;
    try {
      proc = Bun.spawn(task.argv, { cwd: task.cwd, stdout: "pipe", stderr: "pipe" });
    } catch (error) {
      task.output = error instanceof Error ? error.message : String(error);
      task.exitCode = 1;
      this.failTask(task, context);
      return;
    }

    context.procs.add(proc);

    // Capture stdout and stderr into the task's buffer. Output is not streamed
    // live: a successful task stays quiet and only a failed task surfaces its
    // logs (see `reportFinish`), trimmed to the lines that explain the failure —
    // so a failure is never buried under the whole module's output.
    const capture = async (stream: ReadableStream<Uint8Array>): Promise<void> => {
      const decoder = new TextDecoder();
      const reader = stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        task.output += decoder.decode(value, { stream: true });
      }
    };

    const [exitCode] = await Promise.all([
      proc.exited,
      capture(proc.stdout as ReadableStream<Uint8Array>),
      capture(proc.stderr as ReadableStream<Uint8Array>),
    ]);

    context.procs.delete(proc);
    task.exitCode = exitCode;
    task.durationMs = Math.round(performance.now() - startedAt);

    if (exitCode === 0) {
      task.status = "success";
      if (task.cacheable && task.target && !context.noCache && task.hash) {
        await writeCacheEntry(
          context.cacheDir,
          {
            version: MONOREPO_CACHE_VERSION,
            target: task.target.key,
            command: task.command,
            hash: task.hash,
            createdAt: new Date().toISOString(),
            durationMs: task.durationMs,
            outputs: task.target.outputs,
          },
          task.output,
          task.target.dir,
        ).catch(() => {});
      }
      this.reportFinish(task, context);
      return;
    }

    // A task killed because another one already failed is not itself the failure.
    if (context.stopped) {
      task.status = "aborted";
      this.reportFinish(task, context);
      return;
    }

    this.failTask(task, context);
  }

  private failTask(task: TaskType, context: RunContextType): void {
    task.status = "failed";
    context.stopped = true;
    context.failedTask = task;
    for (const proc of context.procs) proc.kill();
    this.reportFinish(task, context);
  }

  // Reduce a failed task's captured output to just the lines that explain the
  // failure — each line carrying a failure signal (from `bun test`, `biome`,
  // `tsgo`/`tsc`, or a thrown error), plus a little surrounding context, with
  // `…` marking skipped gaps. When nothing matches (an opaque failure), the
  // tail of the output is shown as a fallback so the user is never left blind.
  private failureExcerpt(output: string): string[] {
    const lines = output.replace(/\r/g, "").split("\n");
    const signal =
      /\b(?:error|fail(?:ed|ure|s|ing)?|panic|exception|uncaught|unhandled|throw(?:s|n)?|assert\w*|not ok|refus\w*)\b|error TS\d|\(fail\)|[✗✕×✖✘]/i;
    // Passing test lines describe themselves with words like "throw", "exception"
    // or "fails", so they match `signal` and would otherwise anchor the excerpt
    // and drag in whole runs of unrelated `(pass)` lines (and the file headers
    // sitting next to them). A bare caret pointer is likewise meaningless on its
    // own. Neither carries failure information, so never anchor on them and never
    // keep them.
    const noise = /\(pass\)|^\s*\^+\s*$/;
    const before = 1;
    const after = 3;
    const maxLines = 120;

    const keep = new Array<boolean>(lines.length).fill(false);
    let matched = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] as string;
      if (noise.test(line) || !signal.test(line)) continue;
      matched = true;
      for (let j = Math.max(0, i - before); j <= Math.min(lines.length - 1, i + after); j++) keep[j] = true;
    }

    // A context window can still cover a neighbouring noise line; drop those.
    for (let i = 0; i < lines.length; i++) {
      if (noise.test(lines[i] as string)) keep[i] = false;
    }

    if (!matched) {
      return lines.filter((line) => line.trim().length > 0 && !noise.test(line)).slice(-20);
    }

    // Group kept lines into contiguous runs, trim blank edges off each run, and
    // join the runs with a single `…`. Dropping the noise lines above can leave
    // isolated blanks or back-to-back gaps between runs; this keeps the excerpt
    // to the failure blocks themselves without stray whitespace or doubled `…`.
    const isBlank = (line: string): boolean => line.trim().length === 0;
    const excerpt: string[] = [];
    let run: string[] = [];
    const flush = (): void => {
      while (run.length > 0 && isBlank(run[0] as string)) run.shift();
      while (run.length > 0 && isBlank(run[run.length - 1] as string)) run.pop();
      if (run.length === 0) return;
      if (excerpt.length > 0) excerpt.push("…");
      excerpt.push(...run);
      run = [];
    };
    for (let i = 0; i < lines.length; i++) {
      if (keep[i]) run.push(lines[i] as string);
      else flush();
    }
    flush();
    return excerpt.slice(0, maxLines);
  }

  // Persist a task's final state to scrollback (above the live footer). A
  // successful task gets a one-line `✔ label duration`; a failed task gets its
  // status line plus the trimmed excerpt that explains the failure. Cached,
  // skipped and aborted tasks stay silent — the closing summary still reports
  // their counts.
  private reportFinish(task: TaskType, context: RunContextType): void {
    const { logger } = context;

    if (task.status === "success") {
      logger.persist(
        colorize(`${SYMBOLS.success} `, COLORS.success) +
          task.label +
          colorize(`  ${formatDuration(task.durationMs)}`, COLORS.dim),
      );
      return;
    }

    if (task.status !== "failed") return;

    logger.persist(
      colorize(`${SYMBOLS.error} `, COLORS.error) +
        task.label +
        colorize("  failed", COLORS.error) +
        colorize(`  exit ${task.exitCode ?? 1}  ${formatDuration(task.durationMs)}`, COLORS.dim),
    );
    const excerpt = this.failureExcerpt(task.output);
    if (excerpt.length > 0) {
      logger.persist(...excerpt.map((line) => `${colorize("┃", COLORS.error)} ${line}`));
    }
  }

  // Live TTY view: finished tasks stream into scrollback (see `reportFinish`)
  // while a footer pinned to the bottom shows a progress bar and every currently
  // running task with its latest log line. ctrl+c / q aborts. Returns a handle
  // that tears the footer down and restores the terminal.
  private startRenderer(tasks: TaskType[], context: RunContextType): { stop: () => void } {
    const { logger } = context;
    const startedAt = performance.now();

    logger.start(() => {
      context.aborted = true;
      context.stopped = true;
      for (const proc of context.procs) proc.kill();
    });

    const render = (): void => {
      logger.tick();
      logger.renderFooter(this.buildFooter(tasks, logger.spinner, performance.now() - startedAt));
    };

    const interval = setInterval(render, 80);
    render();

    return {
      stop: (): void => {
        clearInterval(interval);
        logger.stop();
      },
    };
  }

  // Build the live footer: a progress bar with a running/failed/elapsed summary,
  // followed by one line per running task showing its latest output line.
  private buildFooter(tasks: TaskType[], spinner: string, elapsedMs: number): string[] {
    const total = tasks.length;
    const finished = tasks.filter((task) => task.status !== "pending" && task.status !== "running").length;
    const running = tasks.filter((task) => task.status === "running");
    const failed = tasks.filter((task) => task.status === "failed").length;

    const width = 22;
    const ratio = total === 0 ? 1 : finished / total;
    const filled = Math.min(width, Math.round(ratio * width));
    const bar =
      colorize("█".repeat(filled), failed > 0 ? COLORS.error : COLORS.success) +
      colorize("░".repeat(width - filled), COLORS.dim);

    const summary = [`${finished}/${total}`];
    if (running.length > 0) summary.push(`${running.length} running`);
    if (failed > 0) summary.push(`${failed} failed`);

    const lines = [
      "",
      `  ${bar}  ${colorize(summary.join(" · "), COLORS.info)}` +
        colorize(`  ${formatDuration(Math.round(elapsedMs))} · ctrl+c to abort`, COLORS.dim),
    ];

    for (const task of running) {
      const last = task.output
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .at(-1);
      lines.push(`  ${colorize(spinner, COLORS.info)} ${task.label}${last ? colorize(`  ${last}`, COLORS.dim) : ""}`);
    }

    return lines;
  }
}
