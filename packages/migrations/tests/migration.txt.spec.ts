import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatePath = join(import.meta.dir, "../src/migration.txt");

describe("migration.txt", () => {
  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{ name }}");
    expect(content).toContain("{{ version }}");
  });

  test("should contain migration decorator", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@decorator.migration()");
  });

  test("should implement IMigration interface", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("implements IMigration");
  });

  test("should have up method with TransactionSQL parameter", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("async up(tx: TransactionSQL): Promise<void>");
  });

  test("should have down method with TransactionSQL parameter", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("async down(tx: TransactionSQL): Promise<void>");
  });

  test("should have getVersion method", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("getVersion(): string");
  });

  test("should have getDependencies method", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("getDependencies(): MigrationClassType[]");
  });

  test("should import decorator and types from @talosjs/migrations", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@talosjs/migrations");
    expect(content).toContain("decorator");
    expect(content).toContain("IMigration");
    expect(content).toContain("MigrationClassType");
  });

  test("should import TransactionSQL from bun", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("TransactionSQL");
    expect(content).toContain("from 'bun'");
  });
});
