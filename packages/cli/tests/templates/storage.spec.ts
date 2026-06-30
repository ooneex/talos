import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../src/templates");

describe("storage.txt", () => {
  const templatePath = join(templatesDir, "storage.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
    expect(content).toContain("{{NAME_UPPER}}");
  });

  test("should contain storage decorator", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@decorator.storage()");
  });

  test("should extend Storage", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("extends Storage");
  });

  test("should have getOptions method", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("getOptions");
  });
});

describe("storage.test.txt", () => {
  const templatePath = join(templatesDir, "storage.test.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
    expect(content).toContain("{{MODULE}}");
  });

  test("should use @module import path", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@module/{{MODULE}}/storage/{{NAME}}StorageAdapter");
  });

  test("should test getOptions method", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("getOptions");
  });
});
