import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates");

describe("package.txt", () => {
  const templatePath = join(templatesDir, "module", "package.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
  });

  test("should have package.json structure", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('"name"');
    expect(content).toContain('"version"');
    expect(content).toContain('"scripts"');
  });

  test("should have required scripts", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('"test"');
    expect(content).toContain('"lint"');
  });
});
