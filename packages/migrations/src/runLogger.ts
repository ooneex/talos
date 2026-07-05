const RESET = "[0m";
const BOLD = "[1m";

/** Palette for statuses and chrome, matching the monorepo runner's log. */
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
  // Bun.color(color, "ansi") returns null when the runtime detects no color support
  // (or the color is invalid), so use it as the support/validity probe. Emit truecolor
  // ("ansi-16m") for the actual sequence: the auto-depth "ansi" encoding is buggy in
  // 16-color terminals (e.g. CI), where it writes the palette index as a raw byte and
  // can produce a malformed escape such as \x1b[38;5;\nm.
  if (!Bun.color(color, "ansi")) return text;
  const ansi = Bun.color(color, "ansi-16m");
  return ansi ? `${ansi}${text}${RESET}` : text;
};

export const bold = (text: string): string => `${BOLD}${text}${RESET}`;

export const formatDuration = (ms: number): string => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

/** Write permanent line(s) to stdout, one per line — the persisted scrollback log. */
export const persist = (...lines: string[]): void => {
  if (lines.length > 0) process.stdout.write(`${lines.join("\n")}\n`);
};

export const runLogger = { persist };
