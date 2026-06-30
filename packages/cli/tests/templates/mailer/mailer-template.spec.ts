import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates");

describe("mailer-template.txt", () => {
  const templatePath = join(templatesDir, "mailer", "mailer-template.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
  });

  test("should use MailerLayout", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("MailerLayout");
  });

  test("should export props type", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("MailerPropsType");
  });
});

describe("mailer-template.test.txt", () => {
  const templatePath = join(templatesDir, "mailer", "mailer-template.test.txt");

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
    expect(content).toContain("@module/{{MODULE}}/mailers/{{NAME}}MailerTemplate");
  });
});
