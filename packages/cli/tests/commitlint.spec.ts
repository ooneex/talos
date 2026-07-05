import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const { COMMIT_TYPES, checkCommitMessageFile, getValidScopes, lintCommitMessage, stripCommitComments } = await import(
  "@/commitlint"
);

// A representative set of scopes for the pure-function tests.
const SCOPES = ["common", "cli", "cache"];

describe("lintCommitMessage", () => {
  test("should accept a well-formed conventional commit", () => {
    expect(lintCommitMessage("feat(cli): Add commitlint init command", SCOPES)).toEqual([]);
  });

  test("should accept the common scope", () => {
    expect(lintCommitMessage("docs(common): Update readme", SCOPES)).toEqual([]);
  });

  test("should accept multiple comma-separated scopes", () => {
    expect(lintCommitMessage("refactor(cli, common): Rework things", SCOPES)).toEqual([]);
  });

  test("should reject an unknown type", () => {
    const errors = lintCommitMessage("feature(cli): Add thing", SCOPES);
    expect(errors.some((error) => error.includes("must be one of"))).toBe(true);
  });

  test("should reject an upper-case type", () => {
    expect(lintCommitMessage("Feat(cli): Add thing", SCOPES).some((error) => error.includes("lower-case"))).toBe(true);
  });

  test("should reject a scope outside the valid set", () => {
    expect(lintCommitMessage("feat(nope): Add thing", SCOPES).some((error) => error.includes("not valid"))).toBe(true);
  });

  test("should reject an empty scope", () => {
    expect(lintCommitMessage("fix: Add thing", SCOPES).some((error) => error.includes("Scope must not be empty"))).toBe(
      true,
    );
  });

  test("should reject a lower-case subject", () => {
    expect(lintCommitMessage("fix(cli): add thing", SCOPES).some((error) => error.includes("upper-case letter"))).toBe(
      true,
    );
  });

  test("should reject a trailing period in the subject", () => {
    expect(lintCommitMessage("fix(cli): Add thing.", SCOPES).some((error) => error.includes("period"))).toBe(true);
  });

  test("should reject a header longer than 100 characters", () => {
    const header = `feat(cli): ${"A".repeat(100)}`;
    expect(lintCommitMessage(header, SCOPES).some((error) => error.includes("at most 100 characters"))).toBe(true);
  });

  test("should reject a header that is not conventional at all", () => {
    expect(lintCommitMessage("just some text", SCOPES).some((error) => error.includes("format"))).toBe(true);
  });

  test("should require a blank line before the body", () => {
    const message = "feat(cli): Add thing\nBody with no blank line";
    expect(lintCommitMessage(message, SCOPES).some((error) => error.includes("blank line"))).toBe(true);
  });

  test("should accept a body separated by a blank line", () => {
    expect(lintCommitMessage("feat(cli): Add thing\n\nA proper body.", SCOPES)).toEqual([]);
  });

  test("should reject an over-long body line", () => {
    const message = `feat(cli): Add thing\n\n${"x".repeat(101)}`;
    expect(lintCommitMessage(message, SCOPES).some((error) => error.includes("Body line"))).toBe(true);
  });

  test("should ignore merge commits", () => {
    expect(lintCommitMessage("Merge branch 'main' into dev", SCOPES)).toEqual([]);
  });

  test("should expose the conventional commit types", () => {
    expect(COMMIT_TYPES).toContain("feat");
    expect(COMMIT_TYPES).toContain("chore");
  });
});

describe("stripCommitComments", () => {
  test("should drop comment lines and the verbose scissors diff", () => {
    const raw = [
      "feat(cli): Add thing",
      "# a git comment",
      "# ------------------------ >8 ------------------------",
      "diff --git a b",
    ].join("\n");
    expect(stripCommitComments(raw)).toBe("feat(cli): Add thing");
  });
});

describe("getValidScopes", () => {
  let dir: string;

  beforeEach(() => {
    dir = join(process.cwd(), ".temp", `scopes-${Date.now()}`);
    mkdirSync(join(dir, "packages", "foo"), { recursive: true });
    mkdirSync(join(dir, "packages", "no-pkg"), { recursive: true });
    mkdirSync(join(dir, "modules", "bar"), { recursive: true });
    writeFileSync(join(dir, "packages", "foo", "package.json"), '{"name":"@x/foo"}');
    writeFileSync(join(dir, "modules", "bar", "package.json"), '{"name":"@x/bar"}');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("should return common plus every package/module directory that has a package.json", async () => {
    expect(await getValidScopes(dir)).toEqual(["bar", "common", "foo"]);
  });

  test("should return just common when there are no packages or modules", async () => {
    const empty = join(process.cwd(), ".temp", `empty-${Date.now()}`);
    mkdirSync(empty, { recursive: true });
    try {
      expect(await getValidScopes(empty)).toEqual(["common"]);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("checkCommitMessageFile", () => {
  let dir: string;

  beforeEach(() => {
    dir = join(process.cwd(), ".temp", `check-${Date.now()}`);
    mkdirSync(join(dir, "packages", "cli"), { recursive: true });
    writeFileSync(join(dir, "packages", "cli", "package.json"), '{"name":"@talosjs/cli"}');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("should return no errors for a valid message file", async () => {
    const file = join(dir, "COMMIT_EDITMSG");
    writeFileSync(file, "feat(cli): Add thing\n# please enter the commit message\n");
    expect(await checkCommitMessageFile(file, dir)).toEqual([]);
  });

  test("should surface errors for an invalid message file", async () => {
    const file = join(dir, "COMMIT_EDITMSG");
    writeFileSync(file, "feat(unknown): add thing.\n");
    expect((await checkCommitMessageFile(file, dir)).length).toBeGreaterThan(0);
  });

  test("should treat a comment-only (empty) message as valid", async () => {
    const file = join(dir, "COMMIT_EDITMSG");
    writeFileSync(file, "# only a comment\n");
    expect(await checkCommitMessageFile(file, dir)).toEqual([]);
  });
});
