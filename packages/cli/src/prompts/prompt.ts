import { TerminalLogger } from "@talosjs/logger";
import type { prompt as EnquirerPromptFn } from "enquirer";
import * as EnquirerModule from "enquirer";

// Kept in sync with `LOG_OPTIONS` in ../utils; inlined here to avoid a circular
// import (utils -> commands -> prompts -> prompt).
const CANCEL_LOG_OPTIONS = { showTimestamp: false, showArrow: false, useSymbol: true } as const;

// enquirer exposes `prompt` as a `static get` accessor on its default-exported
// `Enquirer` class, which Bun's CJS named-export detection does not reliably
// enumerate (it intermittently throws "Export named 'prompt' not found").
// Importing the whole namespace sidesteps that static analysis. The lookup is
// resolved on every call (rather than cached at module scope) so it keeps
// working as a live binding, matching ESM named-import semantics: tests that
// call `mock.module("enquirer", ...)` before importing a command still swap
// in their own `{ prompt }` mock even though this module is only evaluated once.
const resolveEnquirerPrompt = (): typeof EnquirerPromptFn => {
  const namespace = EnquirerModule as {
    prompt?: typeof EnquirerPromptFn;
    default?: { prompt: typeof EnquirerPromptFn };
  };
  const impl = namespace.prompt ?? namespace.default?.prompt;

  if (!impl) {
    throw new Error("enquirer's `prompt` export could not be resolved");
  }

  return impl;
};

/**
 * Wraps enquirer's `prompt` so aborting an interactive prompt exits cleanly.
 *
 * enquirer rejects with an empty string when the user presses Ctrl+C (or Esc).
 * Left unhandled that bubbles up as a blank, confusing error; here it becomes a
 * clear message and the conventional SIGINT exit code (130 = 128 + 2).
 */
export const prompt = async <T = Record<string, unknown>>(
  questions: Parameters<typeof EnquirerPromptFn>[0],
): Promise<T> => {
  try {
    return (await resolveEnquirerPrompt()(questions)) as T;
  } catch (error) {
    if (error === "" || error == null) {
      new TerminalLogger().warn("Operation cancelled", undefined, CANCEL_LOG_OPTIONS);
      process.exit(130);
    }

    throw error;
  }
};
