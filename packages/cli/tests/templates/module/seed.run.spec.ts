import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates");

describe("seed.run.txt", () => {
  const templatePath = join(templatesDir, "module", "seed.run.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain seed logic", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("run");
    expect(content).toContain("SharedDatabase");
    expect(content).toContain("AppEnv");
    expect(content).toContain("container");
    expect(content).toContain("addConstant");
  });
});
