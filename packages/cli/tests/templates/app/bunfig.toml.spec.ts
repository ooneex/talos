import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates");

describe("bunfig.toml.txt", () => {
  const templatePath = join(templatesDir, "app", "bunfig.toml.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain bun configuration", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("[test]");
    expect(content).not.toContain("[workspace]");
  });
});
