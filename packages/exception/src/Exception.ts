import type { StatusCodeType } from "@talosjs/http-status";
import type { ExceptionStackFrameType, IException } from "./types";

export class Exception extends Error implements IException {
  public readonly key: string | null;
  public readonly date: Date = new Date();
  public readonly status: StatusCodeType;
  public readonly data: Record<string, unknown>;
  public readonly native?: Error;

  constructor(
    message: string | Error,
    options?: { key?: string | null; status?: StatusCodeType; data?: Record<string, unknown> },
  ) {
    super(message instanceof Error ? (message as Error).message : message);

    this.key = options?.key ?? null;
    this.status = options?.status || 500;
    this.data = options?.data || {};

    if (message instanceof Error) {
      this.native = message as Error;
    }
    this.name = this.constructor.name;
    this.data = Object.freeze(this.data);
  }

  /**
   * Converts the stack trace into a structured JSON object
   * @returns Array of stack frames or null if no stack trace is available
   */
  public stackToJson(): ExceptionStackFrameType[] | null {
    if (!this.stack) {
      return null;
    }

    const stackLines = this.stack.split("\n");
    const frames: ExceptionStackFrameType[] = [];

    // Skip the first line (error message) and process stack frames
    for (let i = 1; i < stackLines.length; i++) {
      const line = stackLines[i]?.trim();
      if (!line) {
        continue;
      }

      frames.push(parseStackFrame(line));
    }

    return frames;
  }
}

const parseStackFrame = (line: string): ExceptionStackFrameType => {
  const frame: ExceptionStackFrameType = {
    source: line,
  };
  const atMatch = line.match(/^\s*at\s+(.+)$/);

  if (!atMatch?.[1]) {
    return frame;
  }

  const content = atMatch[1];
  const funcWithLocationMatch = content.match(/^(.+?)\s+\((.+)\)$/);

  if (funcWithLocationMatch) {
    applyFunctionFrame(frame, funcWithLocationMatch[1], funcWithLocationMatch[2]);
    return frame;
  }

  applyDirectFrame(frame, content);
  return frame;
};

const applyFunctionFrame = (frame: ExceptionStackFrameType, functionName?: string, location?: string): void => {
  if (functionName) {
    frame.functionName = functionName;
  }

  if (location) {
    applyLocation(frame, location);
  }
};

const applyDirectFrame = (frame: ExceptionStackFrameType, content: string): void => {
  if (applyLocation(frame, content)) {
    return;
  }

  frame.functionName = content;
};

const applyLocation = (frame: ExceptionStackFrameType, location: string): boolean => {
  const locationMatch = location.match(/^(.+):(\d+):(\d+)$/);

  if (!locationMatch) {
    frame.fileName = location;
    return false;
  }

  const [, fileName, lineNumber, columnNumber] = locationMatch;

  if (fileName) {
    frame.fileName = fileName;
  }
  if (lineNumber) {
    frame.lineNumber = Number.parseInt(lineNumber, 10);
  }
  if (columnNumber) {
    frame.columnNumber = Number.parseInt(columnNumber, 10);
  }

  return true;
};
