import { TerminalLogger } from "@talosjs/logger";
import { prompt as enquirerPrompt } from "enquirer";

// Kept in sync with `LOG_OPTIONS` in ../utils; inlined here to avoid a circular
// import (utils -> commands -> prompts -> prompt).
const CANCEL_LOG_OPTIONS = { showTimestamp: false, showArrow: false, useSymbol: true } as const;

/**
 * Wraps enquirer's `prompt` so aborting an interactive prompt exits cleanly.
 *
 * enquirer rejects with an empty string when the user presses Ctrl+C (or Esc).
 * Left unhandled that bubbles up as a blank, confusing error; here it becomes a
 * clear message and the conventional SIGINT exit code (130 = 128 + 2).
 */
export const prompt = async <T = Record<string, unknown>>(
  questions: Parameters<typeof enquirerPrompt>[0],
): Promise<T> => {
  try {
    return (await enquirerPrompt(questions)) as T;
  } catch (error) {
    if (error === "" || error == null) {
      new TerminalLogger().warn("Operation cancelled", undefined, CANCEL_LOG_OPTIONS);
      process.exit(130);
    }

    throw error;
  }
};
