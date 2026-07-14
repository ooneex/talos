import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../src/templates");

describe("e2e.spec.txt", () => {
  const templatePath = join(templatesDir, "e2e.spec.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should import from @playwright/test", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("import { test, expect } from '@playwright/test';");
  });

  test("should declare the sample tests", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("test('has title'");
    expect(content).toContain("test('get started link'");
  });

  test("should not contain template placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).not.toContain("{{");
  });
});

describe("playwright.config.txt", () => {
  const templatePath = join(templatesDir, "playwright.config.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should define the config with the e2e testDir", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("import { defineConfig, devices } from '@playwright/test';");
    expect(content).toContain("export default defineConfig({");
    expect(content).toContain("testDir: './e2e'");
  });

  test("should configure the major browser projects", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("Desktop Chrome");
    expect(content).toContain("Desktop Firefox");
    expect(content).toContain("Desktop Safari");
  });

  test("should not contain template placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).not.toContain("{{");
  });
});
