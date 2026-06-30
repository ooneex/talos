import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../src/templates");

describe("permission.txt", () => {
  const templatePath = join(templatesDir, "permission.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
  });

  test("should contain permission decorator", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@decorator.permission()");
  });

  test("should extend Permission", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("extends Permission");
  });

  test("should have permission methods", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("allow");
    expect(content).toContain("setUserPermissions");
    expect(content).toContain("check");
  });
});

describe("permission.test.txt", () => {
  const templatePath = join(templatesDir, "permission.test.txt");

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
    expect(content).toContain("@module/{{MODULE}}/permissions/{{NAME}}Permission");
  });

  test("should test permission methods", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("allow");
    expect(content).toContain("setUserPermissions");
    expect(content).toContain("check");
  });
});
