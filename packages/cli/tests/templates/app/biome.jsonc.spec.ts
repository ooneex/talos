import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates");

describe("biome.jsonc.txt", () => {
  const templatePath = join(templatesDir, "app", "biome.jsonc.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain biome configuration", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("$schema");
    expect(content).toContain("formatter");
    expect(content).toContain("linter");
  });

  test("should contain css configuration", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("css");
    expect(content).toContain("cssModules");
    expect(content).toContain("tailwindDirectives");
  });
});
