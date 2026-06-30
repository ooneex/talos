import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../src/templates");

describe("logger.txt", () => {
  const templatePath = join(templatesDir, "logger.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
  });

  test("should contain logger decorator", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@decorator.logger()");
  });

  test("should implement ILogger interface", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("implements ILogger");
  });

  test("should have logger methods", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("init");
    expect(content).toContain("log");
    expect(content).toContain("debug");
    expect(content).toContain("info");
    expect(content).toContain("success");
    expect(content).toContain("warn");
    expect(content).toContain("error");
  });
});

describe("logger.test.txt", () => {
  const templatePath = join(templatesDir, "logger.test.txt");

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
    expect(content).toContain("@module/{{MODULE}}/loggers/{{NAME}}Logger");
  });

  test("should test logger methods", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("init");
    expect(content).toContain("log");
    expect(content).toContain("debug");
    expect(content).toContain("info");
    expect(content).toContain("success");
    expect(content).toContain("warn");
    expect(content).toContain("error");
  });
});
