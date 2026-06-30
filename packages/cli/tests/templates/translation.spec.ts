import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../src/templates");

describe("translation.txt", () => {
  const templatePath = join(templatesDir, "translation.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
    expect(content).toContain("{{SNAKE}}");
  });

  test("should contain translation decorator", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@decorator.translation()");
  });

  test("should extend the Translation base class", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("extends Translation");
  });

  test("should expose getName and getDict methods", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("getName = (): string");
    expect(content).toContain("getDict = (): TranslationDictType");
  });

  test("should load the sibling translations.yml as the dictionary", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('import dict from "./translations.yml"');
    expect(content).toContain("dict as TranslationDictType");
  });
});

describe("translation.yml.txt", () => {
  const templatePath = join(templatesDir, "translation.yml.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should be valid YAML with at least one entry", async () => {
    const { YAML } = await import("bun");
    const content = await Bun.file(templatePath).text();
    const parsed = YAML.parse(content) as Record<string, unknown>;
    expect(typeof parsed).toBe("object");
    expect(Object.keys(parsed).length).toBeGreaterThan(0);
  });

  test("should document a pluralization example with all sibling forms", async () => {
    const { YAML } = await import("bun");
    const content = await Bun.file(templatePath).text();
    const parsed = YAML.parse(content) as { cart?: Record<string, { en?: string }> };
    expect(parsed.cart?.items?.en).toBe("{{ count }} item");
    expect(parsed.cart?.items_plural?.en).toBe("{{ count }} items");
    expect(parsed.cart?.items_zero?.en).toBe("No items");
  });
});

describe("translation.json.txt", () => {
  const templatePath = join(templatesDir, "translation.json.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should be valid JSON with at least one entry", async () => {
    const content = await Bun.file(templatePath).text();
    const parsed = JSON.parse(content) as Record<string, unknown>;
    expect(typeof parsed).toBe("object");
    expect(Object.keys(parsed).length).toBeGreaterThan(0);
  });

  test("should document a pluralization example with all sibling forms", async () => {
    const content = await Bun.file(templatePath).text();
    const parsed = JSON.parse(content) as { cart?: Record<string, { en?: string }> };
    expect(parsed.cart?.items?.en).toBe("{{ count }} item");
    expect(parsed.cart?.items_plural?.en).toBe("{{ count }} items");
    expect(parsed.cart?.items_zero?.en).toBe("No items");
  });
});

describe("spa/spa.use-translate.txt", () => {
  const templatePath = join(templatesDir, "spa", "spa.use-translate.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain the NAME placeholder", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
    expect(content).toContain("export const use{{NAME}}Translate");
  });

  test("should import useLang at the feature-folder depth", async () => {
    // The hook lives in `src/features/<feature>/translations`, three levels
    // below `src/shared/hooks/useLang`.
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('import { useLang } from "../../../shared/hooks/useLang"');
  });

  test("should load the sibling translations.json dictionary", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('import dict from "./translations.json"');
  });

  test("should delegate lookup and interpolation to @talosjs/utils", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('from "@talosjs/utils/trans"');
    expect(content).toContain("trans");
    expect(content).toContain("has");
  });
});

describe("translation.test.txt", () => {
  const templatePath = join(templatesDir, "translation.test.txt");

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
    expect(content).toContain("@module/{{MODULE}}/translations/{{NAME}}Translation");
  });

  test("should contain test imports", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("describe");
    expect(content).toContain("expect");
    expect(content).toContain("test");
  });
});
