import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates");

describe(".commitlintrc.ts.txt", () => {
  const templatePath = join(templatesDir, "app", ".commitlintrc.ts.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain commitlint config", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("UserConfig");
    expect(content).toContain("extends");
    expect(content).toContain("rules");
  });

  test("should have commit type rules", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("type-enum");
    expect(content).toContain("feat");
    expect(content).toContain("fix");
    expect(content).toContain("chore");
  });

  test("should have commit scope rules", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("scope-enum");
    expect(content).toContain("common");
    expect(content).toContain("shared");
    expect(content).toContain("app");
  });
});
