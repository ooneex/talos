import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates");

describe("tsconfig.txt", () => {
  const templatePath = join(templatesDir, "module", "tsconfig.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should extend parent tsconfig", async () => {
    const content = await Bun.file(templatePath).text();
    const json = JSON.parse(content);
    expect(json.extends).toBe("../../tsconfig.json");
  });

  test("should only have extends property", async () => {
    const content = await Bun.file(templatePath).text();
    const json = JSON.parse(content);
    expect(Object.keys(json)).toEqual(["extends"]);
  });
});
