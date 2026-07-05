const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

/** Palette for statuses and chrome, matching the migration runner's log. */
export const COLORS = {
  info: "#5AC8FA",
  success: "#30D158",
  error: "#FF453A",
  warn: "#FFD60A",
  dim: "#8E8E93",
  accent: "#BF5AF2",
} as const;

export const SYMBOLS = {
  success: "✔",
  error: "✖",
  skipped: "○",
  aborted: "◌",
  running: "▸",
} as const;

export const colorize = (text: string, color: string): string => {
  const ansi = Bun.color(color, "ansi");
  return ansi ? `${ansi}${text}${RESET}` : text;
};

export const bold = (text: string): string => `${BOLD}${text}${RESET}`;

export const formatDuration = (ms: number): string => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

/** Write permanent line(s) to stdout, one per line — the persisted scrollback log. */
export const persist = (...lines: string[]): void => {
  if (lines.length > 0) process.stdout.write(`${lines.join("\n")}\n`);
};

export const runLogger = { persist };
