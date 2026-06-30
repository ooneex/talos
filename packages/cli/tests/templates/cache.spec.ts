import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../src/templates");

describe("cache.txt", () => {
  const templatePath = join(templatesDir, "cache.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
  });

  test("should contain cache decorator", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@decorator.cache()");
  });

  test("should implement ICache interface", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("implements ICache");
  });

  test("should have cache methods", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("get");
    expect(content).toContain("set");
    expect(content).toContain("delete");
    expect(content).toContain("has");
  });
});

describe("cache.test.txt", () => {
  const templatePath = join(templatesDir, "cache.test.txt");

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
    expect(content).toContain("@module/{{MODULE}}/cache/{{NAME}}Cache");
  });

  test("should test cache methods", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("get");
    expect(content).toContain("set");
    expect(content).toContain("delete");
    expect(content).toContain("has");
  });
});
