import type { ExceptionStackFrameType, IException } from "@talosjs/exception";

/**
 * The stack of what a caller handed to `error()`, as frames.
 *
 * Callers that catch `unknown` pass a plain `Error` cast to `IException` as often as a real exception, for
 * instance a filesystem error thrown while an app boots. It has no `stackToJson()`, so its stack lines are
 * kept as they are instead of hiding the original error behind a TypeError.
 */
export const readStackFrames = (error: IException): ExceptionStackFrameType[] | null => {
  if (typeof error.stackToJson === "function") {
    return error.stackToJson();
  }

  if (!error.stack) {
    return null;
  }

  return error.stack
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((source) => ({ source }));
};
