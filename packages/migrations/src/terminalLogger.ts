import type { IException } from "@talosjs/exception";

const colorize = (text: string, color: string): string => {
  try {
    const ansiColor = Bun.color(color, "ansi");
    const resetAnsi = "[0m";
    return ansiColor ? `${ansiColor}${text}${resetAnsi}` : text;
  } catch {
    return text;
  }
};

const write = (level: "INFO" | "SUCCESS" | "ERROR", message: string): void => {
  const colorMap: Record<"INFO" | "SUCCESS" | "ERROR", string> = {
    INFO: "#007AFF",
    SUCCESS: "#00C851",
    ERROR: "#FF3B30",
  };
  const color = colorMap[level];
  const arrow = `${colorize("->", color)} `;
  const logMessage = `${arrow}${colorize(`[${level}]`, color)} ${colorize(message, color)}`;

  if (level === "ERROR") {
    process.stderr.write(logMessage);
  } else {
    process.stdout.write(logMessage);
  }
};

export const terminalLogger = {
  info: (message: string): void => write("INFO", message),
  success: (message: string): void => write("SUCCESS", message),
  error: (message: string | IException): void => {
    write("ERROR", typeof message === "string" ? message : `${message.message}\n`);
  },
};
