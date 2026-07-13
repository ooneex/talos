import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates");

describe("llm/AGENTS.md.txt", () => {
  const templatePath = join(templatesDir, "llm", "AGENTS.md.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should use {{NAME}} in the project overview", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("# AGENTS.md");
    expect(content).toContain("{{NAME}}");
  });

  test("should index the reference skills", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("`talos-packages`");
    expect(content).toContain("`talos-architecture`");
    expect(content).toContain("`talos-commands`");
    expect(content).toContain("`talos-module`");
    expect(content).toContain("`talos-design`");
    expect(content).toContain("`talos-spa`");
    expect(content).toContain("`talos-env`");
    expect(content).toContain("`talos-scaffold`");
  });

  test("should list the new generator artefacts", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("`queue`");
    expect(content).toContain("`rate-limit`");
    expect(content).toContain("`spa-feature`");
  });

  test("should index the sdk and workflow generators", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("/sdk-create");
    expect(content).toContain("/workflow-create");
    expect(content).toContain("/workflow-transition-create");
  });

  test("should index the workflow skills", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("/commit");
    expect(content).toContain("/pr");
    expect(content).toContain("/review");
    expect(content).toContain("/debug");
    expect(content).toContain("/database-migrate");
    expect(content).toContain("/optimize");
    expect(content).toContain("/translation-translate");
    expect(content).toContain("/issue-found");
    expect(content).toContain("/issue-plan");
    expect(content).toContain("/issue-fix");
  });
});
