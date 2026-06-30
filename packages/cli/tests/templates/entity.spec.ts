import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../src/templates");

describe("entity.txt", () => {
  const templatePath = join(templatesDir, "entity.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
    expect(content).toContain("{{TABLE_NAME}}");
  });

  test("should use Entity decorator with table name placeholder", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('@Entity({\n  name: "{{TABLE_NAME}}",\n})');
  });

  test("should have id primary column with random.id()", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@PrimaryColumn");
    expect(content).toContain("random.id()");
  });

  test("should have lock fields", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("isLocked");
    expect(content).toContain("lockedAt");
  });

  test("should have block fields", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("isBlocked");
    expect(content).toContain("blockedAt");
    expect(content).toContain("blockReason");
  });

  test("should have visibility field", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("isPublic");
  });

  test("should have lang field with LocaleType", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("lang");
    expect(content).toContain("LocaleType");
  });

  test("should have timestamp columns", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@CreateDateColumn");
    expect(content).toContain("@UpdateDateColumn");
    expect(content).toContain("@DeleteDateColumn");
    expect(content).toContain("createdAt");
    expect(content).toContain("updatedAt");
    expect(content).toContain("deletedAt");
  });

  test("should import required dependencies", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('import type { LocaleType } from "@talosjs/translation"');
    expect(content).toContain('import { random } from "@talosjs/utils/random"');
    expect(content).toContain(
      'import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm"',
    );
  });
});

describe("entity.test.txt", () => {
  const templatePath = join(templatesDir, "entity.test.txt");

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
    expect(content).toContain("@module/{{MODULE}}/entities/{{NAME}}Entity");
  });

  test("should import test utilities from bun:test", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('import { describe, expect, test } from "bun:test"');
  });

  test("should import entity class", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('import { {{NAME}}Entity } from "@module/{{MODULE}}/entities/{{NAME}}Entity"');
  });

  test("should test class name ends with Entity", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('endsWith("Entity")');
  });

  test("should test entity instantiation", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("new {{NAME}}Entity()");
  });

  test("should test id property with nanoid length", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("entity.id");
    expect(content).toContain("entity.id.length");
  });

  test("should test lock fields", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('"isLocked" in entity');
    expect(content).toContain('"lockedAt" in entity');
  });

  test("should test block fields", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('"isBlocked" in entity');
    expect(content).toContain('"blockedAt" in entity');
    expect(content).toContain('"blockReason" in entity');
  });

  test("should test visibility field", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('"isPublic" in entity');
  });

  test("should test lang field", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('"lang" in entity');
  });

  test("should test timestamp fields", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('"createdAt" in entity');
    expect(content).toContain('"updatedAt" in entity');
    expect(content).toContain('"deletedAt" in entity');
  });
});
