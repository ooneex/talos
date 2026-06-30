import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../src/templates");

describe("renovate.json.txt", () => {
  const templatePath = join(templatesDir, "renovate.json.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should be valid JSON", async () => {
    const content = await Bun.file(templatePath).text();
    expect(() => JSON.parse(content)).not.toThrow();
  });

  test("should contain renovate schema reference", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("renovate-schema.json");
  });

  test("should extend config:recommended", async () => {
    const config = await Bun.file(templatePath).json();
    expect(config.extends).toContain("config:recommended");
  });

  test("should define packageRules", async () => {
    const config = await Bun.file(templatePath).json();
    expect(Array.isArray(config.packageRules)).toBe(true);
    expect(config.packageRules.length).toBeGreaterThan(0);
  });

  test("should enable automerge for minor and patch updates", async () => {
    const config = await Bun.file(templatePath).json();
    const rule = config.packageRules.find(
      (r: { matchUpdateTypes?: string[]; automerge?: boolean }) =>
        r.matchUpdateTypes?.includes("minor") && r.matchUpdateTypes?.includes("patch"),
    );
    expect(rule).toBeDefined();
    expect(rule.automerge).toBe(true);
  });

  test("should disable automerge for major updates", async () => {
    const config = await Bun.file(templatePath).json();
    const rule = config.packageRules.find((r: { matchUpdateTypes?: string[] }) =>
      r.matchUpdateTypes?.includes("major"),
    );
    expect(rule).toBeDefined();
    expect(rule.automerge).toBe(false);
  });

  test("should configure vulnerability alerts", async () => {
    const config = await Bun.file(templatePath).json();
    expect(config.vulnerabilityAlerts).toBeDefined();
    expect(config.vulnerabilityAlerts.automerge).toBe(true);
  });

  test("should set commitMessagePrefix matching commitlint convention", async () => {
    const config = await Bun.file(templatePath).json();
    expect(config.commitMessagePrefix).toBe("chore(deps):");
  });
});
