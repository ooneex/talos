import { availableParallelism } from "node:os";
import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import {
  computeTaskHash,
  discoverTargets,
  hashRootInputs,
  MONOREPO_CACHE_DIR,
  MONOREPO_CACHE_VERSION,
  type MonorepoTargetType,
  readCacheEntry,
  restoreCacheOutputs,
  sortTargetsByDependencies,
  writeCacheEntry,
} from "../monorepo";
import { LOG_OPTIONS } from "../utils";

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
  target: MonorepoTargetType;
  command: string;
  /** Keys of tasks in the same group that must finish first. */
  deps: string[];
  status: TaskStatusType;
  output: string;
  exitCode: number | null;
  durationMs: number;
  hash: string | null;
};

type RunContextType = {
  logger: TerminalLogger;
  targets: MonorepoTargetType[];
  cacheDir: string;
  rootHash: string;
  fingerprints: Map<string, Promise<string>>;
  noCache: boolean;
  interactive: boolean;
  concurrency: number;
  procs: Set<ReturnType<typeof Bun.spawn>>;
  stopped: boolean;
  aborted: boolean;
  failedTask: TaskType | null;
};

const COLORS = { info: "#007AFF", success: "#00C851", error: "#FF3B30", dim: "#8E8E93" } as const;

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const colorize = (text: string, color: string): string => {
  const ansi = Bun.color(color, "ansi");
  return ansi ? `${ansi}${text}\u001b[0m` : text;
};

const formatDuration = (ms: number): string => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

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
    const logger = new TerminalLogger();

    const commandList =
      typeof commands === "string"
        ? commands
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
        : [];

    if (commandList.length === 0) {
      logger.error("The --commands option is required (e.g. --commands=build,lint)", undefined, LOG_OPTIONS);
      process.exitCode = 1;
      return;
    }

    const rootDir = process.cwd();
    const allTargets = await discoverTargets(rootDir);
    const targets = this.filterTargets(allTargets, packages, modules, logger);
    if (!targets) {
      process.exitCode = 1;
      return;
    }
    if (targets.length === 0) {
      logger.error("No packages or modules found to run", undefined, LOG_OPTIONS);
      process.exitCode = 1;
      return;
    }

    const sorted = sortTargetsByDependencies(targets);
    const includedKeys = new Set(sorted.map((target) => target.key));
    const groups = commandList.map((command) => this.buildGroup(sorted, includedKeys, command));

    const context: RunContextType = {
      logger,
      targets: allTargets,
      cacheDir: join(rootDir, MONOREPO_CACHE_DIR),
      rootHash: await hashRootInputs(rootDir),
      fingerprints: new Map(),
      noCache,
      interactive: !logs && process.stdout.isTTY === true && process.stdin.isTTY === true,
      concurrency: Math.max(1, Math.min(4, availableParallelism())),
      procs: new Set(),
      stopped: false,
      aborted: false,
      failedTask: null,
    };

    const startedAt = performance.now();
    const allTasks = groups.flat();
    const renderer = context.interactive ? this.startRenderer(allTasks, context) : null;

    try {
      for (const group of groups) {
        if (context.stopped) break;
        await this.runGroup(group, context);
      }
    } finally {
      renderer?.stop();
    }

    if (context.interactive) {
      for (const task of allTasks) this.reportFinish(task, context, true);
    }

    if (context.failedTask) {
      process.exitCode = 1;
      return;
    }
    if (context.aborted) {
      logger.error("Aborted", undefined, LOG_OPTIONS);
      process.exitCode = 1;
      return;
    }

    const completed = allTasks.filter((task) => task.status === "success").length;
    const cached = allTasks.filter((task) => task.status === "cached").length;
    const skipped = allTasks.filter((task) => task.status === "skipped").length;
    const parts = [`${completed} completed`, `${cached} from cache`];
    if (skipped > 0) parts.push(`${skipped} skipped`);
    logger.success(
      `Ran ${commandList.join(", ")}: ${parts.join(", ")} in ${formatDuration(Math.round(performance.now() - startedAt))}`,
      undefined,
      LOG_OPTIONS,
    );
  }

  // Resolve `--packages` / `--modules` into targets. With neither flag, every
  // package and module runs. Unknown names abort the run.
  private filterTargets(
    targets: MonorepoTargetType[],
    packages: string | undefined,
    modules: string | undefined,
    logger: TerminalLogger,
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
        logger.error(`No ${type} named "${name}" found`, undefined, LOG_OPTIONS);
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
      deps: target.workspaceDeps.filter((key) => includedKeys.has(key)).map((key) => `${key}#${command}`),
      status: target.scripts[command] === undefined ? "skipped" : "pending",
      output: "",
      exitCode: null,
      durationMs: 0,
      hash: null,
    }));
  }

  // Run one command group with bounded concurrency, launching a task as soon
  // as its workspace dependencies are done. Skipped tasks count as done.
  private async runGroup(tasks: TaskType[], context: RunContextType): Promise<void> {
    const done = new Set<string>();
    for (const task of tasks.filter((entry) => entry.status === "skipped")) {
      done.add(task.key);
      this.reportFinish(task, context);
    }

    const queue = tasks.filter((task) => task.status === "pending");
    const running = new Map<string, Promise<void>>();

    while ((queue.length > 0 || running.size > 0) && !context.stopped) {
      while (running.size < context.concurrency && !context.stopped) {
        let index = queue.findIndex((task) => task.deps.every((dep) => done.has(dep)));
        // Nothing ready and nothing running means a dependency cycle: run anyway.
        if (index === -1 && running.size === 0 && queue.length > 0) index = 0;
        if (index === -1) break;

        const task = queue.splice(index, 1)[0] as TaskType;
        const promise = this.runTask(task, context).finally(() => {
          running.delete(task.key);
          done.add(task.key);
        });
        running.set(task.key, promise);
      }

      if (running.size === 0) break;
      await Promise.race(running.values());
    }

    await Promise.all(running.values());
  }

  private async runTask(task: TaskType, context: RunContextType): Promise<void> {
    task.status = "running";
    const startedAt = performance.now();

    if (!context.interactive) {
      context.logger.info(`Running ${task.label} ...`, undefined, LOG_OPTIONS);
    }

    if (!context.noCache) {
      try {
        task.hash = await computeTaskHash(
          task.target,
          task.command,
          context.targets,
          context.rootHash,
          context.fingerprints,
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
      return;
    }

    let proc: ReturnType<typeof Bun.spawn>;
    try {
      proc = Bun.spawn(["bun", "run", task.command], { cwd: task.target.dir, stdout: "pipe", stderr: "pipe" });
    } catch (error) {
      task.output = error instanceof Error ? error.message : String(error);
      task.exitCode = 1;
      this.failTask(task, context);
      return;
    }

    context.procs.add(proc);

    // Capture stdout and stderr incrementally so the interactive view can show
    // logs while the task is still running.
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
      if (!context.noCache && task.hash) {
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

  // Log a task's final state. In interactive mode this only happens once the
  // live view has been torn down (`force`), as a persistent summary.
  private reportFinish(task: TaskType, context: RunContextType, force = false): void {
    if (context.interactive && !force) return;

    const { logger } = context;
    const output = task.output.trim();

    switch (task.status) {
      case "skipped":
        logger.log(`Skipped ${task.label} (no "${task.command}" script)`, undefined, LOG_OPTIONS);
        break;
      case "cached":
        logger.success(`${task.label} done in ${formatDuration(task.durationMs)} (cache hit)`, undefined, LOG_OPTIONS);
        break;
      case "success":
        logger.success(`${task.label} done in ${formatDuration(task.durationMs)}`, undefined, LOG_OPTIONS);
        break;
      case "failed":
        logger.error(`${task.label} failed (exit code ${task.exitCode ?? 1})`, undefined, LOG_OPTIONS);
        if (output) process.stderr.write(`${output}\n`);
        break;
      case "aborted":
        logger.log(`${task.label} aborted`, undefined, LOG_OPTIONS);
        break;
      default:
        break;
    }
  }

  // Live TTY view: one line per task with a spinner, redrawn on the alternate
  // screen buffer. Clicking a task line toggles its captured logs; ctrl+c (or
  // q) aborts the run. Returns a handle that restores the terminal.
  private startRenderer(tasks: TaskType[], context: RunContextType): { stop: () => void } {
    const write = (text: string): void => {
      process.stdout.write(text);
    };
    const expanded = new Set<string>();
    let lineTaskKeys: (string | null)[] = [];
    let frame = 0;

    const taskLine = (task: TaskType): string => {
      switch (task.status) {
        case "running":
          return colorize(`${SPINNER_FRAMES[frame % SPINNER_FRAMES.length]} Running ${task.label} ...`, COLORS.info);
        case "success":
          return colorize(`✔ ${task.label} (${formatDuration(task.durationMs)})`, COLORS.success);
        case "cached":
          return colorize(`✔ ${task.label} (cache hit)`, COLORS.success);
        case "failed":
          return colorize(`✖ ${task.label} (exit code ${task.exitCode ?? 1})`, COLORS.error);
        case "skipped":
          return colorize(`- ${task.label} (no script)`, COLORS.dim);
        case "aborted":
          return colorize(`- ${task.label} (aborted)`, COLORS.dim);
        default:
          return colorize(`◌ ${task.label}`, COLORS.dim);
      }
    };

    const render = (): void => {
      const rows = process.stdout.rows ?? 24;
      const columns = process.stdout.columns ?? 80;
      const lines: string[] = [];
      lineTaskKeys = [];

      const push = (line: string, key: string | null): void => {
        lines.push(line);
        lineTaskKeys.push(key);
      };

      push(
        colorize("monorepo:run", COLORS.info) +
          colorize(" · click a task to toggle logs · ctrl+c to abort", COLORS.dim),
        null,
      );

      for (const task of tasks) {
        push(taskLine(task), task.key);
        if (!expanded.has(task.key)) continue;

        const logLines = task.output.split("\n").filter((line) => line.trim().length > 0);
        const visibleLogs = logLines.length > 0 ? logLines.slice(-10) : ["(no output)"];
        for (const line of visibleLogs) {
          push(colorize(`    ${line.slice(0, Math.max(0, columns - 5))}`, COLORS.dim), task.key);
        }
      }

      write(`\u001b[H\u001b[0J${lines.slice(0, rows - 1).join("\n")}\n`);
      frame++;
    };

    const onData = (data: Buffer): void => {
      const input = data.toString();

      if (input.includes("\u0003") || input === "q") {
        context.aborted = true;
        context.stopped = true;
        for (const proc of context.procs) proc.kill();
        return;
      }

      // SGR mouse reports: ESC [ < button ; column ; row (M = press, m = release).
      for (const match of input.matchAll(/\u001b\[<(\d+);(\d+);(\d+)M/g)) {
        if (Number(match[1]) !== 0) continue;
        const key = lineTaskKeys[Number(match[3]) - 1];
        if (!key) continue;
        if (expanded.has(key)) expanded.delete(key);
        else expanded.add(key);
        render();
      }
    };

    // Alternate screen + hidden cursor + SGR mouse tracking.
    write("\u001b[?1049h\u001b[?25l\u001b[?1000h\u001b[?1006h");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
    const interval = setInterval(render, 80);
    render();

    return {
      stop: (): void => {
        clearInterval(interval);
        process.stdin.off("data", onData);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        write("\u001b[?1006l\u001b[?1000l\u001b[?25h\u001b[?1049l");
      },
    };
  }
}
