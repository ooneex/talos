import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../src/templates");

describe("cron.txt", () => {
  const templatePath = join(templatesDir, "cron.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
  });

  test("should contain cron decorator", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@decorator.cron()");
  });

  test("should extend Cron", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("extends Cron");
  });

  test("should have cron methods", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("getTime");
    expect(content).toContain("getTimeZone");
    expect(content).toContain("handler");
  });
});

describe("cron.test.txt", () => {
  const templatePath = join(templatesDir, "cron.test.txt");

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
    expect(content).toContain("@module/{{MODULE}}/cron/{{NAME}}Cron");
  });

  test("should test cron methods", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("getTime");
    expect(content).toContain("getTimeZone");
    expect(content).toContain("handler");
  });
});
