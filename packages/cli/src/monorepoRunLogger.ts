import { SPINNER_FRAMES } from "./utils";

const RESET = "\u001b[0m";
const BOLD = "\u001b[1m";

/** Palette for statuses and chrome, shared by the live footer and the persisted log. */
export const COLORS = {
  info: "#5AC8FA",
  success: "#30D158",
  error: "#FF453A",
  warn: "#FFD60A",
  dim: "#8E8E93",
  accent: "#BF5AF2",
} as const;

/** Distinct colors handed out to concurrent tasks so their streamed lines stay readable. */
const TASK_PALETTE = ["#5AC8FA", "#30D158", "#BF5AF2", "#FFD60A", "#FF9F0A", "#FF6482", "#64D2FF", "#AC8E68"] as const;

export const SYMBOLS = {
  success: "✔",
  error: "✖",
  skipped: "○",
  aborted: "◌",
  running: "▸",
} as const;

const ANSI_REGEX = /\u001b\[[0-9;]*m/g;

export const colorize = (text: string, color: string): string => {
  const ansi = Bun.color(color, "ansi");
  return ansi ? `${ansi}${text}${RESET}` : text;
};

export const bold = (text: string): string => `${BOLD}${text}${RESET}`;

export const formatDuration = (ms: number): string => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

/** Deterministic prefix color for a task, so the same task always streams in the same hue. */
export const taskColor = (key: string): string => {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) & 0x7fffffff;
  return TASK_PALETTE[hash % TASK_PALETTE.length] as string;
};

const visibleWidth = (text: string): number => text.replace(ANSI_REGEX, "").length;

/**
 * Truncate to a visible-column budget without cutting through ANSI escape
 * sequences. This is what keeps a long log line from wrapping onto extra
 * terminal rows and desyncing the footer's redraw math.
 */
const truncateToWidth = (text: string, max: number): string => {
  if (max <= 0) return "";
  if (visibleWidth(text) <= max) return text;

  const budget = max - 1; // leave a column for the ellipsis
  let out = "";
  let visible = 0;
  let i = 0;

  while (i < text.length && visible < budget) {
    if (text[i] === "\u001b") {
      const match = /^\u001b\[[0-9;]*m/.exec(text.slice(i));
      if (match) {
        out += match[0];
        i += match[0].length;
        continue;
      }
    }
    out += text[i];
    visible++;
    i++;
  }

  return `${out}…${RESET}`;
};

/**
 * A terminal renderer for the monorepo runner. It keeps a live "footer" pinned
 * to the bottom of the terminal (running tasks + progress) while letting
 * finished tasks accumulate as ordinary scrollback above it — so nothing is
 * hidden behind a keypress and the native scrollback is preserved.
 */
export class MonorepoRunLogger {
  private readonly stream = process.stdout;
  private footerHeight = 0;
  private lastFooter: string[] = [];
  private frame = 0;
  private live = false;
  private abortHandler: (() => void) | null = null;

  public readonly isTTY: boolean = this.stream.isTTY === true;

  private readonly onData = (data: Buffer): void => {
    const input = data.toString();
    if (input.includes("\u0003") || input === "q") this.abortHandler?.();
  };

  /** Current spinner glyph; advance with {@link tick}. */
  public get spinner(): string {
    return SPINNER_FRAMES[this.frame % SPINNER_FRAMES.length] as string;
  }

  public tick(): void {
    this.frame++;
  }

  /** Enter live mode: capture ctrl+c / q, hide the cursor, own the footer. */
  public start(onAbort: () => void): void {
    if (this.live) return;
    this.live = true;
    this.abortHandler = onAbort;
    this.stream.write("\u001b[?25l"); // hide cursor

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on("data", this.onData);
    }
  }

  /** Leave live mode, restoring the terminal to a clean state. */
  public stop(): void {
    if (!this.live) return;
    this.clearFooter();
    this.stream.write("\u001b[?25h"); // show cursor

    if (process.stdin.isTTY) {
      process.stdin.off("data", this.onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }

    this.live = false;
    this.abortHandler = null;
    this.lastFooter = [];
  }

  /** Write permanent line(s) into scrollback, above the live footer. */
  public persist(...lines: string[]): void {
    this.clearFooter();
    if (lines.length > 0) this.stream.write(`${lines.join("\n")}\n`);
    if (this.live) this.drawFooter(this.lastFooter);
  }

  /** Replace the live footer in place (no-op when not in live mode). */
  public renderFooter(lines: string[]): void {
    if (!this.live) return;
    this.lastFooter = lines;
    this.clearFooter();
    this.drawFooter(lines);
  }

  private drawFooter(lines: string[]): void {
    const columns = this.stream.columns ?? 80;
    const rows = Math.max(3, this.stream.rows ?? 24);
    const capped = lines.slice(0, rows - 1).map((line) => truncateToWidth(line, columns));
    if (capped.length === 0) return;
    this.stream.write(capped.join("\n"));
    this.footerHeight = capped.length;
  }

  private clearFooter(): void {
    if (this.footerHeight === 0) return;
    const up = this.footerHeight - 1;
    // Return to the first footer row (column 0), then erase everything below.
    this.stream.write(up > 0 ? `\u001b[${up}F\u001b[0J` : "\r\u001b[0J");
    this.footerHeight = 0;
  }
}
