import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates");

describe("mailer.txt", () => {
  const templatePath = join(templatesDir, "mailer", "mailer.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
  });

  test("should implement IMailer interface", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("implements IMailer");
  });

  test("should have send method", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("send");
  });

  test("should inject mailer", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('@inject("mailer")');
  });

  test("should have @decorator.mailer() decorator", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@decorator.mailer()");
  });

  test("should import decorator from @talosjs/mailer", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('import { decorator } from "@talosjs/mailer"');
  });
});

describe("mailer.test.txt", () => {
  const templatePath = join(templatesDir, "mailer", "mailer.test.txt");

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
    expect(content).toContain("@module/{{MODULE}}/mailers/{{NAME}}Mailer");
  });

  test("should test send method", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("send");
  });
});
