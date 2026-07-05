import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates");

describe("package.json.txt", () => {
  const templatePath = join(templatesDir, "app", "package.json.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
  });

  test("should contain package.json structure", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('"name"');
    expect(content).toContain('"scripts"');
    expect(content).toContain('"workspaces"');
  });

  test("should not contain lint-staged", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).not.toContain("lint-staged");
  });

  test("should contain check script", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('"check"');
    expect(content).toContain("talos monorepo:check --logs");
  });

  test("should not contain dev, build, or stop scripts", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).not.toContain('"dev"');
    expect(content).not.toContain('"build"');
    expect(content).not.toContain('"stop"');
  });

  test("should install the commit hook via a commitlint:init prepare script, not husky", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('"prepare"');
    expect(content).toContain("commitlint:init");
    expect(content).not.toContain("husky");
  });

  test("should not reference tsgo", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).not.toContain("tsgo");
  });
});
