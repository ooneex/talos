import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../src/templates");

describe("repository.txt", () => {
  const templatePath = join(templatesDir, "repository.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
  });

  test("should contain repository decorator", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@decorator.repository()");
  });

  test("should have CRUD methods", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("find");
    expect(content).toContain("findOne");
    expect(content).toContain("create");
    expect(content).toContain("update");
    expect(content).toContain("delete");
    expect(content).toContain("count");
  });

  test("should use partial entity with id for update methods", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("Partial<{{NAME}}Entity> & { id: string }");
    expect(content).toContain("repository.update(entity.id, entity)");
  });

  test("should inject database", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('@inject("database")');
  });
});

describe("repository.test.txt", () => {
  const templatePath = join(templatesDir, "repository.test.txt");

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
    expect(content).toContain("@module/{{MODULE}}/repositories/{{NAME}}Repository");
  });

  test("should test CRUD methods", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("open");
    expect(content).toContain("close");
    expect(content).toContain("find");
    expect(content).toContain("findOne");
    expect(content).toContain("create");
    expect(content).toContain("update");
    expect(content).toContain("delete");
  });
});
