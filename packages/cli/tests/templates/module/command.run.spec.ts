import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates");

describe("command.run.txt", () => {
  const templatePath = join(templatesDir, "module", "command.run.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain command logic", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("#!/usr/bin/env bun");
    expect(content).toContain("@talosjs/command");
    expect(content).toContain("@module/{{name}}/commands/commands");
    expect(content).toContain("run");
  });
});
