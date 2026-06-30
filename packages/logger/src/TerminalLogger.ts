import type { ExceptionStackFrameType, IException } from "@talosjs/exception";
import type { ScalarType } from "@talosjs/types";
import { decorator } from "./decorators";
import type { ILogger, LoggerOptionsType } from "./types";

interface WriteToConsoleConfig {
  level: string;
  message: string;
  date?: Date;
  data?: Record<string, ScalarType>;
  stackTrace?: ExceptionStackFrameType[];
  showArrow?: boolean;
  showTimestamp?: boolean;
  showLevel?: boolean;
  useSymbol?: boolean;
}

@decorator.logger()
export class TerminalLogger implements ILogger {
  private colorizeText(text: string, color: string): string {
    try {
      const ansiColor = Bun.color(color, "ansi");
      const resetAnsi = "\u001b[0m";
      return ansiColor ? `${ansiColor}${text}${resetAnsi}` : text;
    } catch {
      return text;
    }
  }

  private getLevelColor(level: string): string {
    const colorMap: Record<string, string> = {
      ERROR: "#FF3B30",
      WARN: "#FFCC00",
      INFO: "#007AFF",
      DEBUG: "#8E8E93",
      LOG: "#8E8E93",
      SUCCESS: "#00C851",
    };

    return colorMap[level.toUpperCase()] || "white";
  }

  private getLevelSymbol(level: string): string {
    const symbolMap: Record<string, string> = {
      ERROR: "✖",
      WARN: "⚠",
      INFO: "ℹ",
      DEBUG: "⚙",
      LOG: "●",
      SUCCESS: "✔",
    };

    return symbolMap[level.toUpperCase()] || "●";
  }

  private writeToConsole(config: WriteToConsoleConfig): void {
    const {
      level,
      message,
      date,
      data,
      stackTrace,
      showArrow = true,
      showTimestamp = true,
      showLevel = true,
      useSymbol = false,
    } = config;
    const normalizedLevel = level.endsWith("Exception") ? "ERROR" : level;
    const color = this.getLevelColor(normalizedLevel);

    const now = date || new Date();
    const formattedTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    const timestamp = showTimestamp ? `${this.colorizeText(formattedTime, "#B2BEB5")} ` : "";
    const arrow = showArrow ? `${this.colorizeText("->", color)} ` : "";
    const levelDisplay = useSymbol ? this.getLevelSymbol(normalizedLevel) : `[${level}]`;
    const colorizedLevel = showLevel ? `${this.colorizeText(levelDisplay, color)} ` : "";
    const colorizedMessage = this.colorizeText(message, color);

    let logMessage = `${arrow}${timestamp}${colorizedLevel}${colorizedMessage}`;

    if (data && Object.keys(data).length > 0) {
      const dataEntries = Object.entries(data)
        .filter(
          ([key, value]) =>
            key !== "stackTrace" &&
            value != null &&
            (typeof value === "string" ||
              typeof value === "number" ||
              typeof value === "boolean" ||
              typeof value === "bigint"),
        )
        .map(([key, value]) => {
          const valueColor = typeof value === "string" ? "#69E502" : typeof value === "number" ? "#FFE809" : "#D3D3D3";
          const colorizedValue = this.colorizeText(String(value), valueColor);
          return `${this.colorizeText(key, "#79B")}: ${colorizedValue}`;
        });

      if (dataEntries.length > 0) {
        const colorizedData = dataEntries.join("\n");
        logMessage += `\n${colorizedData}`;
      }
    }

    // Add formatted stack trace if available
    if (stackTrace && Array.isArray(stackTrace) && stackTrace.length > 0) {
      const stackHeader = this.colorizeText("Stack Trace:", "#FF6B6B");
      logMessage += `\n${stackHeader}`;

      stackTrace.forEach((frame, index) => {
        const frameNumber = this.colorizeText(`  ${index + 1}.`, "#B2BEB5");
        const functionName = frame.functionName
          ? this.colorizeText(frame.functionName, "#FFD93D")
          : this.colorizeText("<anonymous>", "#8E8E93");
        const fileName = frame.fileName ? this.colorizeText(frame.fileName, "#6BCF7F") : "";
        const lineCol = frame.lineNumber
          ? this.colorizeText(`:${frame.lineNumber}${frame.columnNumber ? `:${frame.columnNumber}` : ""}`, "#B2BEB5")
          : "";

        logMessage += `\n${frameNumber} ${functionName}`;
        if (fileName) {
          logMessage += `\n      at ${fileName}${lineCol}`;
        }
      });
    }

    logMessage += "\n";

    // Write to stderr for error levels, stdout for others
    if (level === "FATAL" || level === "ERROR") {
      process.stderr.write(`${logMessage}`);
    } else {
      process.stdout.write(`${logMessage}`);
    }
  }

  public async init(): Promise<void> {}

  public error(message: string | IException, data?: Record<string, ScalarType>, options?: LoggerOptionsType): void {
    if (typeof message === "string") {
      this.writeToConsole({
        level: "ERROR",
        message,
        ...(data && { data }),
        ...(options?.showArrow !== undefined && { showArrow: options.showArrow }),
        ...(options?.showTimestamp !== undefined && { showTimestamp: options.showTimestamp }),
        ...(options?.showLevel !== undefined && { showLevel: options.showLevel }),
        ...(options?.useSymbol !== undefined && { useSymbol: options.useSymbol }),
      });
    } else {
      // Handle IException object
      const exceptionData: Record<string, ScalarType> = {
        ...(message.data as Record<string, ScalarType>),
        ...(data as Record<string, ScalarType>),
      };

      if (message.status) {
        exceptionData.status = message.status;
      }

      // Get stack trace as structured data for better formatting
      const stackJson = message.stackToJson();
      this.writeToConsole({
        level: message.name,
        message: message.message,
        data: exceptionData,
        ...(stackJson && { stackTrace: stackJson }),
        date: message.date,
        ...(options?.showArrow !== undefined && { showArrow: options.showArrow }),
        ...(options?.showTimestamp !== undefined && { showTimestamp: options.showTimestamp }),
        ...(options?.showLevel !== undefined && { showLevel: options.showLevel }),
        ...(options?.useSymbol !== undefined && { useSymbol: options.useSymbol }),
      });
    }
  }

  public warn(message: string, data?: Record<string, ScalarType>, options?: LoggerOptionsType): void {
    this.writeToConsole({
      level: "WARN",
      message,
      ...(data && { data }),
      ...(options?.showArrow !== undefined && { showArrow: options.showArrow }),
      ...(options?.showTimestamp !== undefined && { showTimestamp: options.showTimestamp }),
      ...(options?.showLevel !== undefined && { showLevel: options.showLevel }),
      ...(options?.useSymbol !== undefined && { useSymbol: options.useSymbol }),
    });
  }

  public info(message: string, data?: Record<string, ScalarType>, options?: LoggerOptionsType): void {
    this.writeToConsole({
      level: "INFO",
      message,
      ...(data && { data }),
      ...(options?.showArrow !== undefined && { showArrow: options.showArrow }),
      ...(options?.showTimestamp !== undefined && { showTimestamp: options.showTimestamp }),
      ...(options?.showLevel !== undefined && { showLevel: options.showLevel }),
      ...(options?.useSymbol !== undefined && { useSymbol: options.useSymbol }),
    });
  }

  public debug(message: string, data?: Record<string, ScalarType>, options?: LoggerOptionsType): void {
    this.writeToConsole({
      level: "DEBUG",
      message,
      ...(data && { data }),
      ...(options?.showArrow !== undefined && { showArrow: options.showArrow }),
      ...(options?.showTimestamp !== undefined && { showTimestamp: options.showTimestamp }),
      ...(options?.showLevel !== undefined && { showLevel: options.showLevel }),
      ...(options?.useSymbol !== undefined && { useSymbol: options.useSymbol }),
    });
  }

  public log(message: string, data?: Record<string, ScalarType>, options?: LoggerOptionsType): void {
    this.writeToConsole({
      level: "LOG",
      message,
      ...(data && { data }),
      ...(options?.showArrow !== undefined && { showArrow: options.showArrow }),
      ...(options?.showTimestamp !== undefined && { showTimestamp: options.showTimestamp }),
      ...(options?.showLevel !== undefined && { showLevel: options.showLevel }),
      ...(options?.useSymbol !== undefined && { useSymbol: options.useSymbol }),
    });
  }

  public success(message: string, data?: Record<string, ScalarType>, options?: LoggerOptionsType): void {
    this.writeToConsole({
      level: "SUCCESS",
      message,
      ...(data && { data }),
      ...(options?.showArrow !== undefined && { showArrow: options.showArrow }),
      ...(options?.showTimestamp !== undefined && { showTimestamp: options.showTimestamp }),
      ...(options?.showLevel !== undefined && { showLevel: options.showLevel }),
      ...(options?.useSymbol !== undefined && { useSymbol: options.useSymbol }),
    });
  }
}
