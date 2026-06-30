import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates");

describe("index.ts", () => {
  const templatePath = join(templatesDir, "docker", "index.ts");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });
});
