import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates");

describe(".gitignore.txt", () => {
  const templatePath = join(templatesDir, "app", ".gitignore.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain common ignore patterns", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("node_modules");
    expect(content).toContain(".env");
    expect(content).toContain("dist");
  });
});
