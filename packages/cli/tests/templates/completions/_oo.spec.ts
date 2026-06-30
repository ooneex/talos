import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates");
const templatePath = join(templatesDir, "completions/_oo.txt");

describe("_oo.txt", () => {
  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should start with compdef directive for oo", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toStartWith("#compdef oo");
  });

  test("should define _oo function", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("_oo()");
    expect(content).toContain('_oo "$@"');
  });

  test("should delegate to _talos", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('_talos "$@"');
  });
});
