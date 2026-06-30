import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates");

describe("nx.json.txt", () => {
  const templatePath = join(templatesDir, "app", "nx.json.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain nx configuration", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("$schema");
    expect(content).toContain("targetDefaults");
  });

  test("should not contain plugins array section", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).not.toContain("@nx/js/typescript");
    expect(content).not.toContain("projectsAffectedByDependencyUpdates");
  });

  test("should contain tui and packageManager settings", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("tui");
    expect(content).toContain("autoExit");
    expect(content).toContain("packageManager");
    expect(content).toContain("bun");
  });

  test("should contain analytics and pluginsConfig settings", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("analytics");
    expect(content).toContain("pluginsConfig");
    expect(content).toContain("@nx/js");
    expect(content).toContain("analyzeLockfile");
  });
});
