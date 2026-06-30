import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates");

describe("test.txt", () => {
  const templatePath = join(templatesDir, "module", "test.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
  });

  test("should test module structure", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("controllers");
    expect(content).toContain("entities");
    expect(content).toContain("middlewares");
    expect(content).toContain("cronJobs");
    expect(content).toContain("events");
  });
});
