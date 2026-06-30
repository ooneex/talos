import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../src/templates");

describe("analytics.txt", () => {
  const templatePath = join(templatesDir, "analytics.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
  });

  test("should contain analytics decorator", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@decorator.analytics()");
  });

  test("should implement IAnalytics interface", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("implements IAnalytics");
  });

  test("should have capture method", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("capture");
  });
});

describe("analytics.test.txt", () => {
  const templatePath = join(templatesDir, "analytics.test.txt");

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
    expect(content).toContain("@module/{{MODULE}}/analytics/{{NAME}}Analytics");
  });

  test("should test capture method", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("capture");
  });
});
