import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates");

describe("module.txt", () => {
  const templatePath = join(templatesDir, "module", "module.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
  });

  test("should export ModuleType", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("ModuleType");
  });

  test("should have controllers and entities arrays", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("controllers");
    expect(content).toContain("entities");
  });

  test("should have middlewares, cronJobs, and events arrays", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("middlewares");
    expect(content).toContain("cronJobs");
    expect(content).toContain("events");
  });
});
