import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatePath = join(import.meta.dir, "../src/migration.test.txt");

describe("migration.test.txt", () => {
  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
  });

  test("should contain test imports", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("describe");
    expect(content).toContain("expect");
    expect(content).toContain("test");
  });

  test("should test class name starts with Migration", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('startsWith("Migration")');
  });

  test("should test up method", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("prototype.up");
  });

  test("should test down method", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("prototype.down");
  });

  test("should test getVersion method", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("prototype.getVersion");
  });

  test("should test getDependencies method", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("prototype.getDependencies");
  });

  test("should contain MODULE placeholder", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{MODULE}}");
  });

  test("should import migration class from @module path", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@module/{{MODULE}}/migrations/{{NAME}}");
  });

  test("should import join from node:path", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('import { join } from "node:path"');
  });

  test("should import yml lock file as default import", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('import {{MODULE}}Yml from "../../{{MODULE}}.yml"');
  });

  test("should contain a hash verification test", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("locked hash");
    expect(content).toContain("CryptoHasher");
    expect(content).toContain("lockedMigrations");
    expect(content).toContain("lockedHash");
  });

  test("should not use Bun.YAML.parse for reading the yml", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).not.toContain("Bun.YAML.parse");
  });
});
