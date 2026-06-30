import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../src/templates");

describe("route.type.txt", () => {
  const templatePath = join(templatesDir, "route.type.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{TYPE_NAME}}");
  });

  test("should export RouteType", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("RouteType");
  });

  test("should have route type properties", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("params");
    expect(content).toContain("payload");
    expect(content).toContain("queries");
    expect(content).toContain("response");
  });
});
