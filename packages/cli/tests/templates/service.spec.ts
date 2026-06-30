import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../src/templates");

describe("service.txt", () => {
  const templatePath = join(templatesDir, "service.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
  });

  test("should contain service decorator", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@decorator.service()");
  });

  test("should implement IService interface", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("implements IService");
    expect(content).not.toContain("IService<");
  });

  test("should have execute method with ServiceDataType parameter", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("execute(data?: ServiceDataType): Promise<any>");
  });

  test("should have ServiceDataType", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("ServiceDataType");
  });

  test("should not use generics on class", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).not.toContain("{{NAME}}Service<");
  });
});

describe("service.test.txt", () => {
  const templatePath = join(templatesDir, "service.test.txt");

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
    expect(content).toContain("@module/{{MODULE}}/services/{{NAME}}Service");
  });

  test("should contain test imports", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("describe");
    expect(content).toContain("expect");
    expect(content).toContain("test");
  });
});
