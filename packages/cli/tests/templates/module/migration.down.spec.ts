import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates");

describe("migration.down.txt", () => {
  const templatePath = join(templatesDir, "module", "migration.down.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain rollback logic", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("down");
  });
});
