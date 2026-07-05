import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Self-contained conventional-commit linter that replaces commitlint and its
 * `.commitlintrc.ts` config. The rules below are a faithful re-creation of the
 * former config; the one difference is the scope list, which is now derived from
 * the workspace at runtime (see {@link getValidScopes}) instead of a hand-kept
 * enum. Backing the `commitlint:init` git hook.
 */

/** Commit types allowed in the header (the former `type-enum`). */
export const COMMIT_TYPES = [
  "build",
  "chore",
  "ci",
  "docs",
  "feat",
  "fix",
  "perf",
  "refactor",
  "revert",
  "style",
  "test",
] as const;

export const HEADER_MAX_LENGTH = 100;
export const BODY_MAX_LINE_LENGTH = 100;

/** The literal scope every project always accepts, alongside its package/module names. */
export const COMMON_SCOPE = "common";

// Workspace roots whose immediate child directories name a valid scope: a
// package of the framework (`packages/*`) or a module of an app (`modules/*`).
const SCOPE_ROOTS = ["packages", "modules"];

// Merge/fixup/revert headers that commitlint ignores by default; kept for parity
// so `git merge`, `git revert` and autosquash commits are never rejected.
const IGNORED_HEADER = /^(Merge |Revert |Reverts |fixup! |squash! |amend! )/;

// Header split into `type`, optional `scope`, optional breaking-change `!`, subject.
const HEADER_REGEX = /^(\w+)(?:\(([^)]*)\))?(!)?: (.+)$/;

// The `--verbose` diff git appends below this scissors line is not part of the message.
const SCISSORS_REGEX = /^# -+ >8 -+/;

/**
 * Resolve the set of valid commit scopes: {@link COMMON_SCOPE} plus the name of
 * every package (`packages/*`) and module (`modules/*`) directory that has a
 * `package.json`. This replaces the static `scope-enum` list the old commitlint
 * config maintained by hand, so new packages/modules become valid scopes with no
 * config edit.
 */
export const getValidScopes = async (rootDir: string): Promise<string[]> => {
  const scopes = new Set<string>([COMMON_SCOPE]);

  for (const root of SCOPE_ROOTS) {
    let entries: Dirent[];
    try {
      entries = await readdir(join(rootDir, root), { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      if (await Bun.file(join(rootDir, root, entry.name, "package.json")).exists()) {
        scopes.add(entry.name);
      }
    }
  }

  return [...scopes].sort();
};

// Split a header's scope segment into individual scopes, tolerating the `,`, `/`
// and `\` delimiters commitlint recognises for multiple scopes.
const splitScopes = (scope: string): string[] =>
  scope
    .split(/[,/\\]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

/**
 * Validate a raw commit message against the project's conventional-commit rules
 * and return a list of human-readable violations (empty when the message is
 * valid). `validScopes` is the set produced by {@link getValidScopes}.
 */
export const lintCommitMessage = (message: string, validScopes: string[]): string[] => {
  const errors: string[] = [];
  const lines = message.replace(/\r\n/g, "\n").split("\n");
  const header = lines[0] ?? "";

  if (IGNORED_HEADER.test(header)) return errors;

  if (header.length > HEADER_MAX_LENGTH) {
    errors.push(`Header must be at most ${HEADER_MAX_LENGTH} characters (got ${header.length}).`);
  }

  const match = HEADER_REGEX.exec(header);
  if (!match) {
    errors.push('Header must follow the "type(scope): Subject" format, e.g. "feat(common): Add login".');
    return errors;
  }

  // Groups 1 (type) and 4 (subject) are always present on a match; group 2
  // (scope) is optional and stays `undefined` when the header omits it.
  const type = match[1] ?? "";
  const scope = match[2];
  const subject = match[4] ?? "";

  // type-case (lower-case) and type-enum.
  if (type !== type.toLowerCase()) {
    errors.push(`Type "${type}" must be lower-case.`);
  }
  if (!(COMMIT_TYPES as readonly string[]).includes(type.toLowerCase())) {
    errors.push(`Type "${type}" must be one of: ${COMMIT_TYPES.join(", ")}.`);
  }

  // scope-empty (never) and scope-enum / scope-case (lower-case).
  if (scope === undefined || scope.trim() === "") {
    errors.push(`Scope must not be empty — use "${COMMON_SCOPE}" or a package/module name.`);
  } else {
    for (const entry of splitScopes(scope)) {
      if (entry !== entry.toLowerCase()) {
        errors.push(`Scope "${entry}" must be lower-case.`);
      }
      if (!validScopes.includes(entry.toLowerCase())) {
        errors.push(`Scope "${entry}" is not valid — use "${COMMON_SCOPE}" or a package/module name.`);
      }
    }
  }

  // subject-empty (never), subject-full-stop (no trailing ".") and subject-case.
  const trimmedSubject = subject.trim();
  if (trimmedSubject === "") {
    errors.push("Subject must not be empty.");
  } else {
    if (trimmedSubject.endsWith(".")) {
      errors.push('Subject must not end with a period (".").');
    }
    // subject-case allows sentence-, start-, pascal- and upper-case — all of
    // which begin with a non-lower-case character (rejecting lower/camel-case).
    if (/^[a-z]/.test(trimmedSubject)) {
      errors.push("Subject must start with an upper-case letter (sentence, start, pascal or upper case).");
    }
  }

  // body-leading-blank and body-max-line-length.
  if (lines.length > 1) {
    if ((lines[1] ?? "").trim() !== "") {
      errors.push("There must be a blank line between the header and the body.");
    }
    for (let index = 2; index < lines.length; index++) {
      const line = lines[index] ?? "";
      if (line.length > BODY_MAX_LINE_LENGTH) {
        errors.push(`Body line ${index + 1} must be at most ${BODY_MAX_LINE_LENGTH} characters (got ${line.length}).`);
      }
    }
  }

  return errors;
};

/**
 * Strip the comment lines git writes into the commit message file and the
 * `--verbose` diff appended below the scissors line, returning the message the
 * author actually wrote.
 */
export const stripCommitComments = (raw: string): string => {
  const result: string[] = [];

  for (const line of raw.replace(/\r\n/g, "\n").split("\n")) {
    if (SCISSORS_REGEX.test(line)) break;
    if (line.startsWith("#")) continue;
    result.push(line);
  }

  return result.join("\n").trim();
};

/**
 * Read a commit message file (the path git passes to the `commit-msg` hook),
 * strip its comments and lint what remains against the workspace scopes.
 * Returns the list of violations; an empty message yields no errors (git aborts
 * an empty commit on its own).
 */
export const checkCommitMessageFile = async (filePath: string, rootDir: string): Promise<string[]> => {
  const message = stripCommitComments(await Bun.file(filePath).text());
  if (message === "") return [];

  const scopes = await getValidScopes(rootDir);
  return lintCommitMessage(message, scopes);
};
