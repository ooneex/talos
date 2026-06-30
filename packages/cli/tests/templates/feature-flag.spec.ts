import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../src/templates");

describe("feature-flag.txt", () => {
  const templatePath = join(templatesDir, "feature-flag.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
    expect(content).toContain("{{KEY}}");
  });

  test("should contain featureFlag decorator", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@decorator.featureFlag()");
  });

  test("should implement IFeatureFlag", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("implements IFeatureFlag");
  });

  test("should have getKey, getDescription and isEnabled methods", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("getKey");
    expect(content).toContain("getDescription");
    expect(content).toContain("isEnabled");
  });
});

describe("feature-flag.test.txt", () => {
  const templatePath = join(templatesDir, "feature-flag.test.txt");

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
    expect(content).toContain("@module/{{MODULE}}/feature-flag/{{NAME}}FeatureFlag");
  });

  test("should test interface methods", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("getKey");
    expect(content).toContain("getDescription");
    expect(content).toContain("isEnabled");
  });

  test("should verify constructor injection count", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("FeatureFlag.length");
    expect(content).toContain("toBe(0)");
  });
});
