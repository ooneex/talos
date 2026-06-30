import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates");

describe("maildev.txt", () => {
  const templatePath = join(templatesDir, "docker", "maildev.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain services definition", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("services:");
  });

  test("should contain image definition", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("image:");
  });

  test("should contain container_name", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("container_name:");
  });
});
