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
      if (!line) continue;

      const frame: ExceptionStackFrameType = {
        source: line,
      };

      // Parse common stack trace formats
      // Format: "    at functionName (file:line:column)"
      // Format: "    at file:line:column"
      // Format: "    at functionName (file)"

      const atMatch = line.match(/^\s*at\s+(.+)$/);
      if (atMatch) {
        const content = atMatch[1];

        // Check if it has parentheses (function name with location)
        const funcWithLocationMatch = content?.match(/^(.+?)\s+\((.+)\)$/);
        if (funcWithLocationMatch) {
          const functionName = funcWithLocationMatch[1];
          const location = funcWithLocationMatch[2];

          if (functionName) {
            frame.functionName = functionName;
          }

          // Parse file:line:column
          const locationMatch = location?.match(/^(.+):(\d+):(\d+)$/);
          if (locationMatch) {
            const fileName = locationMatch[1];
            const lineNum = locationMatch[2];
            const colNum = locationMatch[3];

            if (fileName) {
              frame.fileName = fileName;
            }
            if (lineNum) {
              frame.lineNumber = Number.parseInt(lineNum, 10);
            }
            if (colNum) {
              frame.columnNumber = Number.parseInt(colNum, 10);
            }
          } else if (location) {
            frame.fileName = location;
          }
        } else {
          // Direct file:line:column format
          const directLocationMatch = content?.match(/^(.+):(\d+):(\d+)$/);
          if (directLocationMatch) {
            const fileName = directLocationMatch[1];
            const lineNum = directLocationMatch[2];
            const colNum = directLocationMatch[3];

            if (fileName) {
              frame.fileName = fileName;
            }
            if (lineNum) {
              frame.lineNumber = Number.parseInt(lineNum, 10);
            }
            if (colNum) {
              frame.columnNumber = Number.parseInt(colNum, 10);
            }
          } else if (content) {
            // Assume it's a function name or location without line numbers
            frame.functionName = content;
          }
        }
      }

      frames.push(frame);
    }

    return frames;
  }
}
