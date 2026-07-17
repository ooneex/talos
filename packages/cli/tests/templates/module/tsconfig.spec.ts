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

  test("should include ts and tsx files", async () => {
    const content = await Bun.file(templatePath).text();
    const json = JSON.parse(content);
    expect(json.include).toEqual(["**/*.ts", "**/*.tsx"]);
  });

  test("should exclude node_modules and dist", async () => {
    const content = await Bun.file(templatePath).text();
    const json = JSON.parse(content);
    expect(json.exclude).toEqual(["node_modules", "dist"]);
  });

  test("should have extends, include and exclude properties", async () => {
    const content = await Bun.file(templatePath).text();
    const json = JSON.parse(content);
    expect(Object.keys(json)).toEqual(["extends", "include", "exclude"]);
  });
});
